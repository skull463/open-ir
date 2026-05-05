import { Command } from "commander";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { HttpClientError, postJson } from "./httpClient.ts";
import { error, success } from "./output.ts";

interface IndexResponse {
  knowledgeId: string;
  jobId: string;
}

export function buildIndexCommand(): Command {
  const cmd = new Command("index");
  cmd
    .description("Index a remote git repository.")
    .argument("<git-url>", "https URL of the repository")
    .option("--branch <name>", "branch to index (defaults to 'main' on the server)")
    .option("--token <pat>", "GitHub PAT for private repos")
    .action(runIndex);
  return cmd;
}

async function runIndex(gitUrl: string, options: { branch?: string; token?: string }): Promise<void> {
  if (!/^https?:\/\//u.test(gitUrl)) {
    error(`invalid git URL: ${gitUrl}`, "expected https://… form");
    process.exitCode = 1;
    return;
  }
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }
    const body: Record<string, string> = { repoUrl: gitUrl };
    if (options.branch !== undefined) {
      body["branch"] = options.branch;
    }
    if (options.token !== undefined) {
      body["gitToken"] = options.token;
    }
    const response = await postJson<IndexResponse>("/api/v1/github/index", body);
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
