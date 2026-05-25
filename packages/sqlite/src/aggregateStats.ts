import type { StatsCommitEntry, StatsRepoEntry, StatsResponse, StatsTotals } from "@bb/types";
import type { KnowledgeDoc } from "@bb/types";
import { getSqliteDb } from "./client.ts";

interface CommitHashRecord {
  hash: string;
  inputTokens: string;
  outputTokens: string;
  costUsd: string;
}

export async function aggregateStats(): Promise<StatsResponse> {
  const db = getSqliteDb();
  const rows = db.query("SELECT value FROM knowledge ORDER BY json_extract(value, '$.updatedAt') DESC").all() as {
    value: string;
  }[];

  const repos: StatsRepoEntry[] = [];
  const commitStats: StatsCommitEntry[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let totalFiles = 0;

  for (const row of rows) {
    const doc = JSON.parse(row.value) as KnowledgeDoc;
    const knowledgeId = doc.knowledgeId;
    const source = doc.source;
    const info = doc.info;

    const fileCountRow = db.query("SELECT COUNT(*) as count FROM raw_files WHERE knowledgeId = ?").get(knowledgeId) as {
      count: number;
    };
    const fileCount = fileCountRow.count;

    const commits = pickCommits(source);
    const repoName = deriveRepoName(source, info);
    const type = source.kind === "github" ? ("GITHUB" as const) : ("LOCAL" as const);

    let repoIn = 0;
    let repoOut = 0;
    let repoCost = 0;
    for (const c of commits) {
      const inT = parseNumber(c.inputTokens);
      const outT = parseNumber(c.outputTokens);
      const cost = parseNumber(c.costUsd);
      repoIn += inT;
      repoOut += outT;
      repoCost += cost;
      commitStats.push({
        knowledgeId,
        repoName,
        commitHash: c.hash,
        inputTokens: inT,
        outputTokens: outT,
        estimatedCost: cost,
        totalBatches: 0,
        processingTimeMs: 0,
        totalFiles: fileCount,
        totalFolders: 0,
        filesAnalyzed: fileCount,
        createdAt: "",
        updatedAt: "",
      });
    }

    repos.push({
      knowledgeId,
      repoName,
      type,
      fileCount,
      folderCount: 0,
      inputTokens: repoIn,
      outputTokens: repoOut,
      estimatedCost: repoCost,
    });

    totalInputTokens += repoIn;
    totalOutputTokens += repoOut;
    totalCost += repoCost;
    totalFiles += fileCount;
  }

  const totals: StatsTotals = {
    totalRepos: rows.length,
    totalFiles,
    totalFolders: 0,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost: Math.round(totalCost * 1_000_000) / 1_000_000,
  };

  return { totals, repos, commitStats };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickCommits(source: any): CommitHashRecord[] {
  const raw = source?.commitHashes;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: CommitHashRecord[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const rec = entry as Partial<CommitHashRecord>;
    if (typeof rec.hash !== "string") {
      continue;
    }
    out.push({
      hash: rec.hash,
      inputTokens: typeof rec.inputTokens === "string" ? rec.inputTokens : "0",
      outputTokens: typeof rec.outputTokens === "string" ? rec.outputTokens : "0",
      costUsd: typeof rec.costUsd === "string" ? rec.costUsd : "0",
    });
  }
  return out;
}

function parseNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveRepoName(source: any, info: any): string {
  if (source.kind === "local") {
    const segments = source.sourcePath.split("/").filter((s: string) => s.length > 0);
    return segments.at(-1) ?? source.sourcePath;
  }
  try {
    const segments = new URL(info.repoUrl ?? "").pathname
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const repo = segments.at(-1)?.replace(/\.git$/u, "");
    const owner = segments.at(-2);
    if (owner !== undefined && repo !== undefined) {
      return `${owner}/${repo}`;
    }
  } catch {
    // fall through
  }
  return info.repoUrl ?? "";
}
