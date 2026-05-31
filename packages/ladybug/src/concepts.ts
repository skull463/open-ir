import type { AttachFileToConceptInput, UpsertConceptInput, UpsertTestsEdgeInput } from "@bb/graph-core";
import { _runCypher } from "./client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// :Concept node. Canonical key: (orgId, knowledgeId, slug), collapsed into a
// single surrogate `id` to satisfy LadybugDB's single-column PRIMARY KEY model
// (same convention as Folder/Repo/File in this package). Nodes are matched by
// `id`, never by multi-property pattern.
//
// Merge policy mirrors the neo4j provider:
//   • kind, rationale, createdAt — first-write-wins (set ON CREATE only).
//   • name, enrichmentRunId, updatedAt — last-write-wins (set ON MATCH).
//
// The list of files attached to a concept is derived from the
// HAS_CONCEPT / PLAYS_ROLE / BELONGS_TO_DOMAIN edges — never stored on the node.
// ─────────────────────────────────────────────────────────────────────────────

function conceptId(orgId: string, knowledgeId: string, slug: string): string {
  return `${orgId}::${knowledgeId}::${slug}`;
}

function fileId(knowledgeId: string, relativePath: string): string {
  return `${knowledgeId}::${relativePath}`;
}

const UPSERT_CONCEPT = `
MERGE (c:Concept {id: $id})
ON CREATE SET c.orgId = $orgId,
              c.knowledgeId = $knowledgeId,
              c.slug = $slug,
              c.kind = $kind,
              c.name = $name,
              c.rationale = $rationale,
              c.enrichmentRunId = $enrichmentRunId,
              c.createdAt = $now,
              c.updatedAt = $now
ON MATCH SET c.name = $name,
             c.enrichmentRunId = $enrichmentRunId,
             c.updatedAt = $now
`;

export async function upsertConcept(input: UpsertConceptInput): Promise<void> {
  const now = new Date().toISOString();
  await _runCypher(UPSERT_CONCEPT, {
    id: conceptId(input.scope.orgId, input.scope.knowledgeId, input.slug),
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    slug: input.slug,
    kind: input.kind,
    name: input.name,
    rationale: input.rationale,
    enrichmentRunId: input.enrichmentRunId,
    now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// File-to-concept edges. Cypher doesn't allow a parameterised relationship
// type in MERGE, so we route through three statements and dispatch on
// `edgeKind`. Each MERGE is idempotent; the edge carries enrichmentRunId so
// callers can query "what did run X attach."
// ─────────────────────────────────────────────────────────────────────────────

const ATTACH_HAS_CONCEPT = `
MATCH (f:File {id: $fileId})
MATCH (c:Concept {id: $conceptId})
MERGE (f)-[r:HAS_CONCEPT]->(c)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_PLAYS_ROLE = `
MATCH (f:File {id: $fileId})
MATCH (c:Concept {id: $conceptId})
MERGE (f)-[r:PLAYS_ROLE]->(c)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_BELONGS_TO_DOMAIN = `
MATCH (f:File {id: $fileId})
MATCH (c:Concept {id: $conceptId})
MERGE (f)-[r:BELONGS_TO_DOMAIN]->(c)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

export async function attachFileToConcept(input: AttachFileToConceptInput): Promise<void> {
  const now = new Date().toISOString();
  const params = {
    fileId: fileId(input.scope.knowledgeId, input.relativePath),
    conceptId: conceptId(input.scope.orgId, input.scope.knowledgeId, input.conceptSlug),
    enrichmentRunId: input.enrichmentRunId,
    now,
  };
  switch (input.edgeKind) {
    case "HAS_CONCEPT":
      await _runCypher(ATTACH_HAS_CONCEPT, params);
      return;
    case "PLAYS_ROLE":
      await _runCypher(ATTACH_PLAYS_ROLE, params);
      return;
    case "BELONGS_TO_DOMAIN":
      await _runCypher(ATTACH_BELONGS_TO_DOMAIN, params);
      return;
    default: {
      const _exhaustive: never = input.edgeKind;
      throw new Error(`Unknown concept edge kind: ${_exhaustive as string}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// :TESTS edge — file-to-file. Lives in concepts.ts (not files.ts) because it
// is an enrichment-time discovery, not part of the canonical file write.
// Idempotent on (testFileId, targetFileId).
// ─────────────────────────────────────────────────────────────────────────────

const UPSERT_TESTS_EDGE = `
MATCH (t:File {id: $testId})
MATCH (s:File {id: $targetId})
MERGE (t)-[r:TESTS]->(s)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

export async function upsertTestsEdge(input: UpsertTestsEdgeInput): Promise<void> {
  const now = new Date().toISOString();
  await _runCypher(UPSERT_TESTS_EDGE, {
    testId: fileId(input.scope.knowledgeId, input.testFileRelativePath),
    targetId: fileId(input.scope.knowledgeId, input.targetFileRelativePath),
    enrichmentRunId: input.enrichmentRunId,
    now,
  });
}
