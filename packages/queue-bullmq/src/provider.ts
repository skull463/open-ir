import { Queue, Worker, type Job } from "bullmq";
import { JobType, type JobMessage, type PayloadFor } from "@bb/types";
import { QueueConnectError, QueueNotConnectedError } from "@bb/errors";
import { connectRedis, closeRedis, pingRedis, getRedisConnection } from "@bb/redis";
import { defaultConcurrencyFor, registerQueueProvider } from "@bb/queue";
import type {
  FailedJob,
  IQueueProvider,
  JobHandler,
  NormalizedEnqueueOptions,
  QueuePingResult,
  RemoveKnowledgeJobsResult,
  WorkerRegistrationOptions,
} from "@bb/queue-core";
import { dedupeKey, mapBullmqPriority } from "./priority.ts";

const QUEUE_PREFIX = "bb";

const ALL_JOB_TYPES: readonly JobType[] = [JobType.GithubIndex, JobType.GithubPull, JobType.LocalIngest];

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: false,
  attempts: 3,
  backoff: { type: "fixed", delay: 5000 },
} as const;

class BullmqQueueProvider implements IQueueProvider {
  private queues = new Map<JobType, Queue>();
  private workers: Worker[] = [];

  async connect(): Promise<void> {
    await connectRedis();
    try {
      const connection = getRedisConnection();
      for (const type of ALL_JOB_TYPES) {
        const queue = new Queue(type, {
          connection,
          prefix: QUEUE_PREFIX,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
        this.queues.set(type, queue);
      }
    } catch (cause: unknown) {
      this.queues.clear();
      throw cause instanceof QueueConnectError ? cause : new QueueConnectError(cause);
    }
  }

  async close(): Promise<void> {
    const ws = this.workers.splice(0);
    await Promise.all(ws.map((w) => w.close()));
    const qs = Array.from(this.queues.values());
    this.queues.clear();
    await Promise.all(qs.map((q) => q.close()));
    await closeRedis();
  }

  async ping(): Promise<QueuePingResult> {
    return pingRedis();
  }

  async enqueueRaw<T extends JobType>(
    type: T,
    message: JobMessage<PayloadFor<T>>,
    opts: NormalizedEnqueueOptions,
  ): Promise<string> {
    const queue = this.requireQueue(type);
    const jobId = dedupeKey(type, message.knowledgeId);
    await queue.add(type, message, {
      jobId,
      priority: mapBullmqPriority(opts.priority),
    });
    return jobId;
  }

  registerWorker<T extends JobType>(type: T, handler: JobHandler<T>, opts: WorkerRegistrationOptions = {}): void {
    if (this.queues.size === 0) {
      throw new QueueNotConnectedError();
    }
    const concurrency = opts.concurrency ?? defaultConcurrencyFor(type);
    const worker = new Worker(
      type,
      async (job: Job<JobMessage<PayloadFor<T>>>) => {
        await handler(job.data);
      },
      {
        connection: getRedisConnection(),
        prefix: QUEUE_PREFIX,
        concurrency,
      },
    );
    this.workers.push(worker);
  }

  async removeKnowledgeJobs(knowledgeId: string): Promise<RemoveKnowledgeJobsResult> {
    let removed = 0;
    for (const type of ALL_JOB_TYPES) {
      const queue = this.queues.get(type);
      if (queue === undefined) {
        continue;
      }
      const jobId = dedupeKey(type, knowledgeId);
      const job = await queue.getJob(jobId);
      if (job === undefined || job === null) {
        continue;
      }
      try {
        await job.remove();
        removed += 1;
      } catch {
        // active jobs cannot be removed; leave them to finish naturally
      }
    }
    return { removed };
  }

  async listFailedJobs(): Promise<FailedJob[]> {
    const out: FailedJob[] = [];
    for (const [type, queue] of this.queues) {
      const failed = await queue.getJobs(["failed"]);
      for (const job of failed) {
        out.push(normalizeFailed(type, job));
      }
    }
    return out;
  }

  private requireQueue(type: JobType): Queue {
    const q = this.queues.get(type);
    if (q === undefined) {
      throw new QueueNotConnectedError();
    }
    return q;
  }
}

function normalizeFailed(type: JobType, job: Job): FailedJob {
  const data = job.data as JobMessage<unknown> | undefined;
  const knowledgeId = typeof data?.knowledgeId === "string" ? data.knowledgeId : "";
  const failedAtMs = typeof job.finishedOn === "number" ? job.finishedOn : Date.now();
  return {
    id: String(job.id ?? ""),
    type,
    knowledgeId,
    attempts: job.attemptsMade ?? 0,
    failedAt: new Date(failedAtMs).toISOString(),
    reason: job.failedReason ?? "",
    payload: data?.payload ?? null,
  };
}

registerQueueProvider("bullmq", () => new BullmqQueueProvider());
