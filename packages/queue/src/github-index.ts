import { JobPriority, JobType, KnowledgeState, type GithubIndexPayload } from "@bb/types";
import { knowledgeDb } from "@bb/db";
import { _getQueue } from "./manager.ts";
import { buildJobMessage, dedupeKey, mapPriority } from "./envelope.ts";

export interface EnqueueOptions {
  priority?: JobPriority;
}

export async function enqueueGithubIndex(payload: GithubIndexPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.GithubIndex, priority, payload);
  const jobId = dedupeKey(JobType.GithubIndex, payload.knowledgeId);

  await knowledgeDb.setKnowledgeState(payload.knowledgeId, KnowledgeState.Queued);

  const queue = _getQueue(JobType.GithubIndex);
  await queue.add(JobType.GithubIndex, message, {
    jobId,
    priority: mapPriority(priority),
  });

  return jobId;
}
