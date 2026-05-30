import type { EnrichmentFailure, KnowledgeDoc } from "@bb/types";
import { EnrichmentState } from "@bb/types";
import { KnowledgeNotFoundError } from "@bb/errors";
import { _getDb } from "./client.ts";
import { Collections } from "./collections.ts";

function knowledgeCollection() {
  return _getDb().collection<KnowledgeDoc>(Collections.Knowledge);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mongo enrichment ledger for ConceptGraphStrategy. State lives on the
// existing :KnowledgeDoc — no new collection. Knowledge.state itself stays
// PROCESSING throughout enrichment; this ledger tracks per-file progress so
// retries can resume by skipping `completedFiles`.
//
// All updates throw `KnowledgeNotFoundError` if the document is missing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Begin or resume an enrichment attempt. Stamps a new `enrichmentRunId`,
 * clears `enrichmentFailures` (failed files should be re-evaluated on the
 * retry), transitions to `Running`. `completedFiles` is preserved so a
 * BullMQ retry can skip work that already finished — the disk artifact
 * tree at `meta-output/enrichment/<slug>.json` is the canonical source of
 * truth, and `completedFiles` mirrors that. A clean re-enrichment requires
 * an explicit reset, not a retry.
 */
export async function startEnrichmentRun(knowledgeId: string, runId: string): Promise<void> {
  const now = new Date();
  const result = await knowledgeCollection().updateOne(
    { knowledgeId },
    {
      $set: {
        enrichmentRunId: runId,
        enrichmentState: EnrichmentState.Running,
        enrichmentFailures: [],
        updatedAt: now,
      },
      $setOnInsert: {
        completedFiles: [],
      },
    },
  );
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}

/**
 * Returns the list of files already enriched in the current/last attempt.
 * Used by the strategy to pre-filter the work queue on retry. Empty array
 * if the knowledge has no recorded enrichment runs.
 */
export async function getCompletedEnrichmentFiles(knowledgeId: string): Promise<string[]> {
  const doc = await knowledgeCollection().findOne({ knowledgeId }, { projection: { completedFiles: 1 } });
  if (doc === null) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
  return Array.isArray(doc.completedFiles) ? doc.completedFiles : [];
}

/**
 * Records that `filePath` has been successfully enriched. Idempotent: relies
 * on `$addToSet` so a re-run of the same file does not duplicate the entry.
 */
export async function markFileEnriched(knowledgeId: string, filePath: string): Promise<void> {
  const result = await knowledgeCollection().updateOne(
    { knowledgeId },
    {
      $addToSet: { completedFiles: filePath },
      $set: { updatedAt: new Date() },
    },
  );
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}

/**
 * Records or updates a per-file enrichment failure. The array is keyed by
 * `filePath` (one entry per file); subsequent failures for the same file
 * replace the prior entry rather than accumulating. Diagnostic, not
 * load-bearing — the strategy decides whether the knowledge fails overall.
 */
export async function recordEnrichmentFailure(knowledgeId: string, failure: EnrichmentFailure): Promise<void> {
  const db = knowledgeCollection();
  // Remove any existing entry for this path, then push the fresh one.
  await db.updateOne({ knowledgeId }, { $pull: { enrichmentFailures: { filePath: failure.filePath } } });
  const result = await db.updateOne(
    { knowledgeId },
    {
      $push: { enrichmentFailures: failure },
      $set: { updatedAt: new Date() },
    },
  );
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}

/** Transitions the ledger to `Completed`. Caller is responsible for then transitioning the parent `KnowledgeState`. */
export async function completeEnrichmentRun(knowledgeId: string): Promise<void> {
  const result = await knowledgeCollection().updateOne(
    { knowledgeId },
    { $set: { enrichmentState: EnrichmentState.Completed, updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}

/**
 * Transitions the ledger to `Failed`. Knowledge can be retried by calling
 * `startEnrichmentRun` again with a fresh run id.
 */
export async function failEnrichmentRun(knowledgeId: string): Promise<void> {
  const result = await knowledgeCollection().updateOne(
    { knowledgeId },
    { $set: { enrichmentState: EnrichmentState.Failed, updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new KnowledgeNotFoundError(knowledgeId);
  }
}
