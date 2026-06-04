import { JobPriority, JobType, KnowledgeState, type GithubIndexPayload } from "@bb/types";
import { knowledgeDb } from "@bb/db";
import { buildJobMessage } from "./envelope.ts";
import { getQueue } from "./registry.ts";

export interface EnqueueOptions {
  priority?: JobPriority;
}

export async function enqueueGithubIndex(payload: GithubIndexPayload, opts: EnqueueOptions = {}): Promise<string> {
  const priority = opts.priority ?? JobPriority.Normal;
  const message = buildJobMessage(JobType.GithubIndex, priority, payload);

  await knowledgeDb.setKnowledgeState(payload.knowledgeId, KnowledgeState.Queued);

  return getQueue().enqueueRaw(JobType.GithubIndex, message, { priority });
}
