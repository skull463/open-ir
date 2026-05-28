import { runCypher, toNeo4jInt } from "@bb/graph-db";
import type { ChannelName, ScoredHit } from "./smartSearchChannels.ts";

export interface FusedResult {
  path: string;
  knowledge_id: string;
  repo_name: string;
  score: number;
  matched_channels: ChannelName[];
  source_type: "code";
}

export interface Cluster {
  folder: string;
  repo_name: string;
  file_count: number;
  top_file: string;
}

/**
 * Groups of files in the search result that share a `:Concept` attachment
 * (ConceptGraphStrategy hypergraph). Restricted to the conceptually-grouping
 * kinds (`role`, `pattern`, `domain`) — `ontology` / `business` / `capability`
 * concepts are returned as per-file metadata, not clusters. Present only when
 * at least one file in the result set has a qualifying concept attachment.
 */
export interface ConceptCluster {
  slug: string;
  kind: string;
  name: string;
  file_count: number;
  sample_files: string[];
}

export interface SmartSearchResult {
  query: string;
  channels_used: ChannelName[];
  total_matches: number;
  repos_matched: string[];
  top_results: FusedResult[];
  clusters: Cluster[];
  concept_clusters?: ConceptCluster[];
}

const CHANNEL_WEIGHTS: Record<ChannelName, number> = {
  purpose: 0.25,
  businessContext: 0.05,
  paths: 0.2,
  keywords: 0.2,
  classes: 0.15,
  functions: 0.1,
  importsInternal: 0.025,
  importsExternal: 0.025,
};

export function fuseHits(perChannel: Record<ChannelName, ScoredHit[]>): Map<string, FusedResult> {
  const fused = new Map<string, FusedResult>();
  for (const channel of Object.keys(perChannel) as ChannelName[]) {
    const hits = perChannel[channel];
    if (hits.length === 0) {
      continue;
    }
    const max = Math.max(...hits.map((hit) => hit.score), 0);
    if (max === 0) {
      continue;
    }
    const weight = CHANNEL_WEIGHTS[channel];
    for (const hit of hits) {
      const key = `${hit.knowledgeId}::${hit.path}`;
      const normalized = (hit.score / max) * weight;
      const existing = fused.get(key);
      if (existing === undefined) {
        fused.set(key, {
          path: hit.path,
          knowledge_id: hit.knowledgeId,
          repo_name: "",
          score: normalized,
          matched_channels: [channel],
          source_type: "code",
        });
      } else {
        existing.score += normalized;
        if (!existing.matched_channels.includes(channel)) {
          existing.matched_channels.push(channel);
        }
      }
    }
  }
  return fused;
}

export async function attachRepoNames(results: FusedResult[]): Promise<void> {
  const ids = Array.from(new Set(results.map((row) => row.knowledge_id)));
  if (ids.length === 0) {
    return;
  }
  const rows = (await runCypher(
    `MATCH (k:Knowledge) WHERE k.knowledgeId IN $ids
     RETURN k.knowledgeId AS knowledgeId, k.repoName AS repoName`,
    { ids },
  )) as Array<{ knowledgeId: string; repoName: string | null }>;
  const lookup = new Map(rows.map((row) => [row.knowledgeId, row.repoName ?? ""]));
  for (const result of results) {
    result.repo_name = lookup.get(result.knowledge_id) ?? "";
  }
}

export function clusterByFolder(results: FusedResult[]): Cluster[] {
  const buckets = new Map<string, { folder: string; repo_name: string; files: FusedResult[] }>();
  for (const result of results) {
    const folder = topTwoSegments(result.path);
    const key = `${result.knowledge_id}::${folder}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { folder, repo_name: result.repo_name, files: [] };
      buckets.set(key, bucket);
    }
    bucket.files.push(result);
  }
  const clusters: Cluster[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.files.length < 2) {
      continue;
    }
    bucket.files.sort((a, b) => b.score - a.score);
    const head = bucket.files[0];
    if (head === undefined) {
      continue;
    }
    clusters.push({
      folder: bucket.folder,
      repo_name: bucket.repo_name,
      file_count: bucket.files.length,
      top_file: head.path,
    });
  }
  clusters.sort((a, b) => b.file_count - a.file_count);
  return clusters;
}

function topTwoSegments(relativePath: string): string {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return relativePath;
  }
  return `${segments[0]}/${segments[1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concept clusters — ConceptGraphStrategy hypergraph grouping. Walks
// HAS_CONCEPT / PLAYS_ROLE / BELONGS_TO_DOMAIN edges for the result set's
// files and aggregates by `:Concept` slug. Restricted to grouping-axis kinds
// (`role` / `pattern` / `domain`) so we don't drown the response in single-
// file ontology concepts. Returns an empty array if no qualifying concepts
// attach to any file in the result set — callers omit the field when empty.
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPT_CLUSTER_KINDS = ["role", "pattern", "domain"];
const CONCEPT_CLUSTER_MIN_FILE_COUNT = 2;
const CONCEPT_CLUSTER_LIMIT = 20;
const CONCEPT_CLUSTER_SAMPLE_LIMIT = 5;

interface ConceptClusterRow {
  slug: string | null;
  kind: string | null;
  name: string | null;
  fileCount: number | { toNumber(): number };
  sampleFiles: string[];
}

export async function buildConceptClusters(results: FusedResult[]): Promise<ConceptCluster[]> {
  if (results.length === 0) {
    return [];
  }
  const files = results.map((r) => ({ knowledgeId: r.knowledge_id, path: r.path }));
  const rows = (await runCypher(
    `UNWIND $files AS file
     MATCH (f:File {knowledgeId: file.knowledgeId, relativePath: file.path})
     MATCH (f)-[:HAS_CONCEPT|PLAYS_ROLE|BELONGS_TO_DOMAIN]->(c:Concept)
     WHERE c.kind IN $kinds
     WITH c, collect(DISTINCT f.relativePath) AS paths
     WITH c.slug AS slug, c.kind AS kind, c.name AS name,
          size(paths) AS fileCount,
          paths[..$sampleLimit] AS sampleFiles
     WHERE fileCount >= $minCount
     RETURN slug, kind, name, fileCount, sampleFiles
     ORDER BY fileCount DESC
     LIMIT $limit`,
    {
      files,
      kinds: CONCEPT_CLUSTER_KINDS,
      sampleLimit: toNeo4jInt(CONCEPT_CLUSTER_SAMPLE_LIMIT),
      minCount: toNeo4jInt(CONCEPT_CLUSTER_MIN_FILE_COUNT),
      limit: toNeo4jInt(CONCEPT_CLUSTER_LIMIT),
    },
  )) as ConceptClusterRow[];
  return rows
    .filter(
      (row): row is ConceptClusterRow & { slug: string; kind: string; name: string } =>
        row.slug !== null && row.kind !== null && row.name !== null,
    )
    .map((row) => ({
      slug: row.slug,
      kind: row.kind,
      name: row.name,
      file_count: typeof row.fileCount === "number" ? row.fileCount : row.fileCount.toNumber(),
      sample_files: row.sampleFiles,
    }));
}
