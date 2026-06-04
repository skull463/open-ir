import type { JobMessage, JobPriority, JobType, PayloadFor } from "@bb/types";

export function buildJobMessage<T extends JobType>(
  type: T,
  priority: JobPriority,
  payload: PayloadFor<T>,
): JobMessage<PayloadFor<T>> {
  return {
    id: crypto.randomUUID(),
    type,
    priority,
    knowledgeId: payload.knowledgeId,
    attempt: 0,
    createdAt: new Date().toISOString(),
    payload,
  };
}
