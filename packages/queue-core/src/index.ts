import type { JobMessage, JobPriority, JobType, PayloadFor } from "@bb/types";

export interface NormalizedEnqueueOptions {
  priority: JobPriority;
}

export interface WorkerRegistrationOptions {
  concurrency?: number;
}

export type JobHandler<T extends JobType> = (msg: JobMessage<PayloadFor<T>>) => Promise<void>;

export interface QueuePingResult {
  ok: boolean;
  latencyMs: number;
}

export interface FailedJob {
  id: string;
  type: JobType;
  knowledgeId: string;
  attempts: number;
  failedAt: string;
  reason: string;
  payload: unknown;
}

export interface RemoveKnowledgeJobsResult {
  removed: number;
}

export interface IQueueProvider {
  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<QueuePingResult>;

  enqueueRaw<T extends JobType>(
    type: T,
    message: JobMessage<PayloadFor<T>>,
    opts: NormalizedEnqueueOptions,
  ): Promise<string>;

  registerWorker<T extends JobType>(type: T, handler: JobHandler<T>, opts?: WorkerRegistrationOptions): void;

  removeKnowledgeJobs(knowledgeId: string): Promise<RemoveKnowledgeJobsResult>;

  listFailedJobs(): Promise<FailedJob[]>;
}
