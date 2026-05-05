import { JobType, KnowledgeState, type GithubIndexPayload, type JobMessage, type LocalIngestPayload } from "@bb/types";
import { setKnowledgeState } from "@bb/mongo";
import { setKnowledgeStateInGraph } from "@bb/neo4j";
import { registerWorker } from "@bb/queue";
import { IngestError } from "@bb/errors";
import { ensureReposRoot, repoCloneDir } from "./paths.ts";
import { gitClone } from "./clone.ts";
import { BasicFileAnalysisStrategy } from "./BasicFileAnalysisStrategy.ts";
import type { IngestionStrategy } from "./Strategy.ts";

const DEFAULT_BRANCH = "main";

const STRATEGY: IngestionStrategy = new BasicFileAnalysisStrategy();

export function registerGithubWorkers(): void {
  registerWorker(JobType.GithubIndex, handleGithubIndex);
}

export function registerLocalIngestWorker(): void {
  registerWorker(JobType.LocalIngest, handleLocalIngest);
}

async function handleGithubIndex(msg: JobMessage<GithubIndexPayload>): Promise<void> {
  const { knowledgeId, repoUrl, branch, gitToken } = msg.payload;
  await transitionState(knowledgeId, KnowledgeState.Processing);
  try {
    await ensureReposRoot();
    const destDir = repoCloneDir(knowledgeId);
    await gitClone({
      repoUrl,
      branch: branch ?? DEFAULT_BRANCH,
      destDir,
      ...(gitToken !== undefined ? { gitToken } : {}),
    });
    await STRATEGY.ingest({ knowledgeId, rootDir: destDir });
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `github_index handler failed: ${describe(cause)}`, cause);
  }
}

async function handleLocalIngest(msg: JobMessage<LocalIngestPayload>): Promise<void> {
  const { knowledgeId, rootDir } = msg.payload;
  await transitionState(knowledgeId, KnowledgeState.Processing);
  try {
    await STRATEGY.ingest({ knowledgeId, rootDir });
    await transitionState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await transitionState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, `local_ingest handler failed: ${describe(cause)}`, cause);
  }
}

async function transitionState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await setKnowledgeState(knowledgeId, state);
  await setKnowledgeStateInGraph(knowledgeId, state).catch(() => undefined);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
