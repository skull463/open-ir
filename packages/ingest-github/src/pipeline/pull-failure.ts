import { IngestError, UsageLimitExceededError } from "@bb/errors";
import { logger } from "@bb/logger";
import type { UsageGuard } from "@bb/types";
import { CancellationError, clearCancellation } from "./cancellation.ts";
import { classifyFailure, isRetryable } from "./failure-classifier.ts";
import { persistFailure, persistHalted, markNonRetryable } from "./run-helpers.ts";
import type { ProgressContext } from "#src/progress/types.ts";

export interface PullFailureDeps {
  knowledgeId: string;
  usageGuard?: UsageGuard | undefined;
  progressContext: ProgressContext;
}

/**
 * Translate a thrown cause from the pull pipeline into the correct persisted
 * state, then re-throw. Always throws — never returns. Mirrors the index path's
 * inline catch in `run.ts`:
 *
 * - Cancellation: clear the flag and re-throw verbatim.
 * - `UsageLimitExceededError`: flush the partial usage before classifying.
 * - Retryable: persist HALTED and throw a plain `IngestError` (queue retries).
 * - Terminal: persist FAILED, emit the failure SSE, throw a non-retryable error.
 */
export async function throwPullFailure(cause: unknown, deps: PullFailureDeps): Promise<never> {
  const { knowledgeId, usageGuard, progressContext } = deps;
  if (cause instanceof CancellationError) {
    clearCancellation(knowledgeId);
    logger.info(`pull: cancelled for ${knowledgeId}`);
    throw cause;
  }
  if (cause instanceof UsageLimitExceededError && usageGuard !== undefined) {
    await usageGuard.flushPartial(cause.cumulative).catch((flushErr: unknown) => {
      logger.warn(
        `pull: usageGuard.flushPartial failed for ${knowledgeId}: ${flushErr instanceof Error ? flushErr.message : String(flushErr)}`,
      );
    });
  }
  const { category, reason, detail } = classifyFailure(cause);
  if (isRetryable(category)) {
    await persistHalted(knowledgeId, category, reason, detail);
    throw new IngestError(knowledgeId, `github_pull failed: ${reason}`, cause);
  }
  await persistFailure(knowledgeId, category, reason, detail);
  progressContext.failed(reason, undefined, category, detail);
  throw markNonRetryable(new IngestError(knowledgeId, `github_pull failed: ${reason}`, cause));
}
