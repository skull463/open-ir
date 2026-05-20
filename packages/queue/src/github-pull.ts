import { JobPriority, JobType, KnowledgeState, type GithubPullPayload } from "@bb/types";
import { knowledge as dbKnowledge } from "@bb/db";
import { _getQueue } from "./manager.ts";
import { buildJobMessage, dedupeKey, mapPriority } from "./envelope.ts";
import type { EnqueueOptions } from "./github-index.ts";

export async function enqueueGithubPull(payload: GithubPullPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.GithubPull, priority, payload);
  const jobId = dedupeKey(JobType.GithubPull, payload.knowledgeId);

  await dbKnowledge.setKnowledgeState(payload.knowledgeId, KnowledgeState.Queued);

  const queue = _getQueue(JobType.GithubPull);
  await queue.add(JobType.GithubPull, message, {
    jobId,
    priority: mapPriority(priority),
  });

  return jobId;
}
