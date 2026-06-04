import type { JobType } from "@bb/types";
import type { JobHandler, WorkerRegistrationOptions } from "@bb/queue-core";
import { getQueue } from "./registry.ts";

export type { JobHandler, WorkerRegistrationOptions };

export function registerWorker<T extends JobType>(
  type: T,
  handler: JobHandler<T>,
  opts: WorkerRegistrationOptions = {},
): void {
  getQueue().registerWorker(type, handler, opts);
}
