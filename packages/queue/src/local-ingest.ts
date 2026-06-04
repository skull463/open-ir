import { JobPriority, JobType, type LocalIngestPayload } from "@bb/types";
import { buildJobMessage } from "./envelope.ts";
import { getQueue } from "./registry.ts";
import type { EnqueueOptions } from "./github-index.ts";

export async function enqueueLocalIngest(payload: LocalIngestPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.LocalIngest, priority, payload);

  return getQueue().enqueueRaw(JobType.LocalIngest, message, { priority });
}
