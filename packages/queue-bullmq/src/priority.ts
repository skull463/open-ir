import { JobPriority, type JobType } from "@bb/types";

const PRIORITY_TO_BULLMQ: Record<JobPriority, number> = {
  [JobPriority.Low]: 1000,
  [JobPriority.Normal]: 100,
  [JobPriority.High]: 10,
};

export function mapBullmqPriority(priority: JobPriority): number {
  return PRIORITY_TO_BULLMQ[priority];
}

export function dedupeKey(type: JobType, knowledgeId: string): string {
  return `${type}-${knowledgeId}`;
}
