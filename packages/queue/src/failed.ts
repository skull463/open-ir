import type { FailedJob } from "@bb/queue-core";
import { getQueue } from "./registry.ts";

export type { FailedJob };

export async function listFailedJobs(): Promise<FailedJob[]> {
  return getQueue().listFailedJobs();
}
