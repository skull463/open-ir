import { KnowledgeState } from "@bb/types";
import { knowledge } from "@bb/db";
import { knowledge as graphKnowledge } from "@bb/graph-db";
import type { PipelineSummary } from "#src/types/pipeline.ts";

export async function transitionState(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await knowledge.setKnowledgeState(knowledgeId, state);
  await graphKnowledge.setKnowledgeStateInGraph(knowledgeId, state).catch(() => undefined);
}

export function emptyPullSummary(commitHash: string): PipelineSummary {
  return {
    filesAnalyzed: 0,
    foldersSummarised: 0,
    repoSummarised: false,
    graphNodesWritten: 0,
    commitHash,
    tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };
}
