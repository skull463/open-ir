import { Command } from "commander";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { getJson, HttpClientError } from "./httpClient.ts";
import { error } from "./output.ts";

interface RepoEntry {
  knowledgeId: string;
  source: { kind: "github"; repoUrl: string; branch?: string } | { kind: "local"; sourcePath: string };
  state: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

interface ListResponse {
  repos: RepoEntry[];
}

export function buildLsCommand(): Command {
  const cmd = new Command("ls");
  cmd.description("List indexed knowledge entries.").action(runLs);
  return cmd;
}

async function runLs(): Promise<void> {
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const { repos } = await getJson<ListResponse>("/api/v1/repos");
    if (repos.length === 0) {
      process.stdout.write(
        "No indexed knowledge yet. Run `bytebell index <url>` or `bytebell ingest [path]` to add one.\n",
      );
      return;
    }
    renderTable(repos);
    process.stdout.write(`\n${repos.length} ${repos.length === 1 ? "entry" : "entries"}.\n`);
  } catch (cause: unknown) {
    if (cause instanceof ServerStartTimeoutError) {
      error(cause.message);
    } else if (cause instanceof HttpClientError) {
      error(cause.message);
    } else {
      error(cause instanceof Error ? cause.message : String(cause));
    }
    process.exitCode = 1;
  }
}

function renderTable(repos: RepoEntry[]): void {
  const headers = ["ID", "SOURCE", "STATE", "UPDATED", "FILES"];
  const rows = repos.map((r) => [
    `${r.knowledgeId.slice(0, 8)}…`,
    formatSource(r.source),
    r.state,
    formatDate(r.updatedAt),
    String(r.fileCount),
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const writeRow = (cols: string[]): void => {
    process.stdout.write(cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ") + "\n");
  };
  writeRow(headers);
  for (const row of rows) {
    writeRow(row);
  }
}

function formatSource(source: RepoEntry["source"]): string {
  if (source.kind === "github") {
    const slug = parseGithubSlug(source.repoUrl);
    const suffix = source.branch !== undefined && source.branch.length > 0 ? `@${source.branch}` : "";
    return `github:${slug}${suffix}`;
  }
  return `local:${source.sourcePath}`;
}

function parseGithubSlug(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    return u.pathname.replace(/^\/+/u, "").replace(/\.git$/u, "");
  } catch {
    return repoUrl;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
