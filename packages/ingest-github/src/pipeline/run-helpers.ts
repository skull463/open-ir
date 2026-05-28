import {
  KnowledgeState,
  type GithubIndexPayload,
  type KnowledgeFailureCategory,
  type LocalIngestPayload,
} from "@bb/types";
import { knowledgeDb } from "@bb/db";
import { knowledgeGraph } from "@bb/graph-db";

/**
 * Persists the FAILED state + structured failure reason to Mongo, then
 * mirrors the state into Neo4j on a best-effort basis. Errors from both
 * sides are swallowed so the throw path is preserved.
 *
 * Extracted from `run.ts` so `runGithub` and `runLocal` (now in `run-local.ts`)
 * share one implementation.
 */
export async function persistFailure(
  knowledgeId: string,
  category: KnowledgeFailureCategory,
  reason: string,
  detail?: string,
): Promise<void> {
  await knowledgeDb.markKnowledgeFailed(knowledgeId, reason, category, detail).catch(() => undefined);
  await knowledgeGraph.setKnowledgeStateInGraph(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
}

/** Type guard discriminating `GithubIndexPayload` from `LocalIngestPayload`. */
export function isGithubPayload(payload: GithubIndexPayload | LocalIngestPayload): payload is GithubIndexPayload {
  return (payload as GithubIndexPayload).repoUrl !== undefined;
}
