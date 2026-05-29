import { Command } from "commander";
import type { StatsCommitEntry, StatsRepoEntry, StatsResponse } from "@bb/types";
import { ensureServerRunning } from "./serverSpawn.ts";
import { ServerStartTimeoutError } from "@bb/errors";
import { getJson, HttpClientError } from "./httpClient.ts";
import { error, table } from "./output.ts";

const COST_UNKNOWN = -1;

export function buildStatsCommand(): Command {
  const cmd = new Command("stats");
  cmd.description("Show ingestion totals, per-repo breakdown, and per-commit token usage.").action(runStats);
  return cmd;
}

async function runStats(): Promise<void> {
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const stats = await getJson<StatsResponse>("/api/v1/stats");
    renderTotals(stats);
    if (stats.repos.length > 0) {
      process.stdout.write("\nREPOS\n");
      renderRepos(stats.repos);
    }
    if (stats.commitStats.length > 0) {
      process.stdout.write("\nCOMMITS\n");
      renderCommits(stats.commitStats);
    }
  } catch (cause: unknown) {
    handleError(cause);
  }
}

function renderTotals(stats: StatsResponse): void {
  const t = stats.totals;
  process.stdout.write("TOTALS\n");
  process.stdout.write(`  repos             ${t.totalRepos}\n`);
  process.stdout.write(`  files             ${t.totalFiles}\n`);
  process.stdout.write(`  input tokens      ${t.totalInputTokens.toLocaleString()}\n`);
  process.stdout.write(`  output tokens     ${t.totalOutputTokens.toLocaleString()}\n`);
  process.stdout.write(`  estimated cost    ${formatCost(t.totalEstimatedCost)}\n`);
}

function renderRepos(repos: StatsRepoEntry[]): void {
  const headers = ["NAME", "TYPE", "FILES", "INPUT", "OUTPUT", "COST"];
  const rows = repos.map((r) => [
    r.repoName,
    r.type,
    String(r.fileCount),
    r.inputTokens.toLocaleString(),
    r.outputTokens.toLocaleString(),
    formatCost(r.estimatedCost),
  ]);
  table(headers, rows);
}

function renderCommits(commits: StatsCommitEntry[]): void {
  // Group by repo so commits stay readable when multiple repos are indexed.
  // Preserves the API's ordering within each group; groups appear in the
  // order their first commit shows up (= most-recent activity first).
  const grouped = new Map<string, StatsCommitEntry[]>();
  for (const c of commits) {
    const bucket = grouped.get(c.repoName);
    if (bucket === undefined) {
      grouped.set(c.repoName, [c]);
    } else {
      bucket.push(c);
    }
  }

  const headers = ["COMMIT", "INPUT", "OUTPUT", "COST", "TIME (ms)", "FILES"];
  let first = true;
  for (const [repoName, group] of grouped) {
    if (!first) {
      process.stdout.write("\n");
    }
    first = false;
    process.stdout.write(`  ${repoName}\n`);
    const rows = group.map((c) => [
      c.commitHash.slice(0, 8),
      c.inputTokens.toLocaleString(),
      c.outputTokens.toLocaleString(),
      formatCost(c.estimatedCost),
      String(c.processingTimeMs),
      String(c.filesAnalyzed),
    ]);
    table(headers, rows);
  }
}

function formatCost(value: number): string {
  if (value === COST_UNKNOWN) {
    return "unknown";
  }
  return `$${value.toFixed(6)}`;
}

function handleError(cause: unknown): void {
  if (cause instanceof ServerStartTimeoutError) {
    error(cause.message);
  } else if (cause instanceof HttpClientError) {
    error(cause.message);
  } else {
    error(cause instanceof Error ? cause.message : String(cause));
  }
  process.exitCode = 1;
}
