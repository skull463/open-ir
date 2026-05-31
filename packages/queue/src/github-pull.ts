import { JobPriority, JobType, KnowledgeState, type GithubPullPayload } from "@bb/types";
import { knowledgeDb } from "@bb/db";
import { buildJobMessage } from "./envelope.ts";
import { getQueue } from "./registry.ts";
import type { EnqueueOptions } from "./github-index.ts";

export async function enqueueGithubPull(payload: GithubPullPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.GithubPull, priority, payload);

  await knowledgeDb.setKnowledgeState(payload.knowledgeId, KnowledgeState.Queued);

  return getQueue().enqueueRaw(JobType.GithubPull, message, { priority });
}
