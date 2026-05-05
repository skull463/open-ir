import { Command } from "commander";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { HttpClientError, postJson } from "./httpClient.ts";
import { error, success } from "./output.ts";

interface IngestResponse {
  knowledgeId: string;
  jobId: string;
}

export function buildIngestCommand(): Command {
  const cmd = new Command("ingest");
  cmd
    .description("Ingest a local directory (defaults to the current working directory).")
    .argument("[path]", "path to a local directory containing the source tree")
    .action(runIngest);
  return cmd;
}

async function runIngest(rawPath: string | undefined): Promise<void> {
  const sourcePath = path.resolve(rawPath ?? process.cwd());
  try {
    const s = await stat(sourcePath);
    if (!s.isDirectory()) {
      error(`Not a directory: ${sourcePath}`);
      process.exitCode = 1;
      return;
    }
  } catch {
    error(`Path does not exist: ${sourcePath}`);
    process.exitCode = 1;
    return;
  }

  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const response = await postJson<IngestResponse>("/api/v1/local/index", { sourcePath });
    success(`Indexing knowledge ${response.knowledgeId} (job ${response.jobId})`);
  } catch (cause: unknown) {
    handleError(cause);
  }
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
