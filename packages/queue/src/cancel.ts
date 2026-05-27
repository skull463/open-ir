import type { RemoveKnowledgeJobsResult } from "@bb/queue-core";
import { getQueue } from "./registry.ts";

export type { RemoveKnowledgeJobsResult };

export async function removeKnowledgeJobs(knowledgeId: string): Promise<RemoveKnowledgeJobsResult> {
  return getQueue().removeKnowledgeJobs(knowledgeId);
}
