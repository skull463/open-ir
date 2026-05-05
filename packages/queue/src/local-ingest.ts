import { JobPriority, JobType, type LocalIngestPayload } from "@bb/types";
import { _getQueue } from "./manager.ts";
import { buildJobMessage, dedupeKey, mapPriority } from "./envelope.ts";
import type { EnqueueOptions } from "./github-index.ts";

export async function enqueueLocalIngest(payload: LocalIngestPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.LocalIngest, priority, payload);
  const jobId = dedupeKey(JobType.LocalIngest, payload.knowledgeId);

  const queue = _getQueue(JobType.LocalIngest);
  await queue.add(JobType.LocalIngest, message, {
    jobId,
    priority: mapPriority(priority),
  });

  return jobId;
}
