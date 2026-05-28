// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { getJson } from "./httpClient.ts";
import { createProgressBar, createSpinner, error, type ProgressBar } from "./output.ts";

export interface IndexResponse {
  knowledgeId: string;
  jobId: string;
}

export interface RepoFailure {
  reason: string;
  category: string;
  at: string;
  detail?: string;
}

export interface RepoStatus {
  knowledgeId: string;
  state: string;
  fileCount: number;
  totalFiles?: number;
  processedFiles?: number;
  failure?: RepoFailure | null;
}

const POLL_INTERVAL_MS = 1500;

export async function pollIndexToCompletion(knowledgeId: string, jobId: string): Promise<void> {
  const spinner = createSpinner(`Indexing knowledge ${knowledgeId} (job ${jobId})...`);
  let bar: ProgressBar | null = null;

  while (true) {
    try {
      const status = await getJson<RepoStatus>(`/api/v1/repos/${knowledgeId}`);

      if (status.totalFiles !== undefined && status.totalFiles > 0) {
        if (bar === null) {
          spinner.stop(true, `Starting ingestion for ${knowledgeId}`);
          bar = createProgressBar(`Ingesting ${knowledgeId}`);
        }
        bar.update(status.processedFiles ?? 0, status.totalFiles, `Ingesting ${knowledgeId}`);
      } else {
        spinner.update(`Indexing: ${status.state}${status.fileCount > 0 ? ` (${status.fileCount} files)` : ""}`);
      }

      if (status.state === "PROCESSED") {
        const msg = `Successfully indexed ${knowledgeId} (${status.fileCount} files)`;
        if (bar !== null) {
          bar.stop(true, msg);
        } else {
          spinner.stop(true, msg);
        }
        return;
      }

      if (status.state === "FAILED") {
        const failMsg = status.failure?.reason ?? "unknown error";
        if (bar !== null) {
          bar.stop(false, `Indexing failed: ${failMsg}`);
        } else {
          spinner.stop(false, `Indexing failed: ${failMsg}`);
        }
        if (status.failure) {
          error(`category: ${status.failure.category}`);
          if (status.failure.detail) {
            error(`detail:   ${status.failure.detail}`);
          }
        }
        return;
      }
    } catch (cause: unknown) {
      const msg = `Failed to poll status: ${cause instanceof Error ? cause.message : String(cause)}`;
      if (bar !== null) {
        bar.stop(false, msg);
      } else {
        spinner.stop(false, msg);
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
