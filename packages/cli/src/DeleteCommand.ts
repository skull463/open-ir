import { Command } from "commander";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { deleteJson, HttpClientError } from "./httpClient.ts";
import { promptRepoSelector } from "./repoSelectorPrompt.ts";
import { error, success } from "./output.ts";

interface DeleteResponse {
  knowledgeId: string;
  jobsRemoved: number;
  mongoDeleted: number;
  rawDeleted: number;
  statsDeleted: number;
}

export function buildDeleteCommand(): Command {
  const cmd = new Command("delete");
  cmd.description("Pick one or more indexed knowledge entries and delete them from Mongo + Neo4j.").action(runDelete);
  return cmd;
}

async function runDelete(): Promise<void> {
  try {
    const ctx = await ensureServerRunning();
    if (ctx.alreadyRunning === false && ctx.logPath !== undefined) {
      process.stderr.write(`(started server in background; logs: ${ctx.logPath})\n`);
    }

    const result = await promptRepoSelector({
      title: "Select entries to delete",
      filterKind: "all",
      multi: true,
      emptyMessage: "No indexed knowledge yet. Run `bytebell index <url>` or `bytebell ingest [path]` to add one.",
      confirm: { prompt: formatDeletePrompt },
    });
    if (result === null) {
      process.stderr.write("cancelled\n");
      return;
    }

    // Delete sequentially — the API is per-knowledge, the queue handles the
    // actual cancellation of any in-flight jobs.
    for (const { item } of result.picked) {
      const response = await deleteJson<DeleteResponse>(`/api/v1/repos/${encodeURIComponent(item.knowledgeId)}`);
      success(
        `removed ${item.label} (raw: ${response.rawDeleted}, stats: ${response.statsDeleted}, jobs: ${response.jobsRemoved})`,
      );
    }
  } catch (cause: unknown) {
    handleError(cause);
  }
}

function formatDeletePrompt(labels: string[]): string {
  if (labels.length === 1) {
    return `Delete ${labels[0]} from Mongo + Neo4j? [y/N]`;
  }
  return `Delete ${labels.length} entries from Mongo + Neo4j? [y/N]`;
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
