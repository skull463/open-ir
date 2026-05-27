import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { logger } from "@bb/logger";
import type { FileAnalyzer } from "#src/types/pipeline.ts";
import type { IngestStrategy, StrategyInput, StrategyResult } from "#src/types/strategy.ts";
import { throwIfCancelled } from "#src/pipeline/cancellation.ts";
import { classifyFailure } from "#src/pipeline/failure-classifier.ts";
import { withConcurrency } from "#src/pipeline/concurrency.ts";
import { scanAndClassify } from "#src/strategies/flat-folder/phases/scan-and-classify.ts";
import { analyseSmallFiles } from "#src/strategies/flat-folder/phases/analyse-small.ts";
import { analyseBigFiles } from "#src/strategies/flat-folder/phases/analyse-big-files.ts";
import { writeEligibleFiles } from "#src/strategies/flat-folder/eligible-files.ts";
import { backfillMissingFields } from "#src/strategies/flat-folder/backfill/fields.ts";
import { FileAnalysisCache } from "#src/strategies/flat-folder/file-analysis-cache.ts";
import { storeFilesNoFolders } from "#src/strategies/concept-graph/phases/store-files-no-folders.ts";
import { enrichFiles } from "#src/strategies/concept-graph/phases/enrich-files.ts";
import type { ProgressContext, ProgressContextFactory } from "#src/progress/types.ts";
import { nullProgressContextFactory } from "#src/progress/NullProgressReporter.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ConceptGraphStrategy — the hypergraph-enrichment counterpart to
// FlatFolderStrategy. Reuses the per-file analysis pipeline (scan, analyse
// small + big, backfill) directly from `#src/strategies/flat-folder/...`
// — those phases are file-local, not folder-aware, and are equally suitable
// for either strategy. We deliberately do NOT lift them to a shared
// `#src/pipeline/phases/` location: that refactor would risk regressions in
// the live flat-folder pipeline for negligible architectural gain
// (intra-package imports are first-class per the workspace rules).
//
// What this strategy replaces:
//   • Phase 5 (folder summaries) — dropped entirely. No `:Folder` nodes.
//   • Phase 6 (repo summary)     — dropped entirely. No `:Repo` node.
//   • Phase 7 (graph store)      — replaced by `store-files-no-folders` which
//                                   writes only `:File` + reverse-linked
//                                   `:Keyword` / `:Class` / `:Function` /
//                                   `:Module` nodes.
//
// What this strategy adds:
//   • Per-file MCP enrichment (Phase 5 in this strategy's numbering) — emits
//     `:Concept` / `:Contract` / `:Guidepost` hypergraph nodes plus
//     file-to-concept / contract / file edges. Lives in
//     `phases/enrich-files.ts`; wired in once Step 6 of the rollout lands.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConceptGraphStrategyDeps {
  fileAnalyzer: FileAnalyzer;
  progressContextFactory?: ProgressContextFactory;
}

export function createConceptGraphStrategy(deps: ConceptGraphStrategyDeps): IngestStrategy {
  const progressContextFactory = deps.progressContextFactory ?? nullProgressContextFactory;
  return {
    name: "concept-graph",
    async execute(input: StrategyInput): Promise<StrategyResult> {
      const { context, source, archiveSink, metaPaths } = input;
      const { knowledgeId, orgId, repoId, llmCallContext } = context;
      const progressContext: ProgressContext = progressContextFactory(knowledgeId);

      try {
        // Shared LLM limiter — same pool flat-folder uses; nothing about the
        // concept-graph strategy needs a separate budget for phases 1–3.
        const llmConcurrency = getConfigValue(Config.LlmConcurrency);
        const limiter = withConcurrency(llmConcurrency);

        // ── Phase 1: scan + classify (reused) ──────────────────────────────
        progressContext.phaseChanged("scan");
        logger.info(`concept-graph: phase1 (scan + classify) starting for ${knowledgeId} limit=${llmConcurrency}`);
        throwIfCancelled(knowledgeId);
        const scanInput: Parameters<typeof scanAndClassify>[0] = {
          knowledgeId,
          source,
          metaPaths,
          limiter,
          progressContext,
        };
        if (llmCallContext !== undefined) {
          scanInput.llmCallContext = llmCallContext;
        }
        const { manifest } = await scanAndClassify(scanInput);

        const eligibleInput: Parameters<typeof writeEligibleFiles>[0] = {
          knowledgeId,
          manifest,
          source,
        };
        if (archiveSink !== undefined) {
          eligibleInput.archiveSink = archiveSink;
        }
        await writeEligibleFiles(eligibleInput);

        // ── Phase 2: analyse small + big (reused) ──────────────────────────
        progressContext.phaseChanged("file_analysis");
        logger.info(
          `concept-graph: phase2 (analyse small ${manifest.summary.smallCount} + big ${manifest.summary.bigCount}) starting in parallel`,
        );
        throwIfCancelled(knowledgeId);
        const smallInput: Parameters<typeof analyseSmallFiles>[0] = {
          knowledgeId,
          manifest,
          source,
          metaPaths,
          analyzer: deps.fileAnalyzer,
          limiter,
          progressContext,
        };
        if (archiveSink !== undefined) {
          smallInput.archiveSink = archiveSink;
        }
        if (llmCallContext !== undefined) {
          smallInput.llmCallContext = llmCallContext;
        }
        const bigInput: Parameters<typeof analyseBigFiles>[0] = {
          knowledgeId,
          manifest,
          source,
          metaPaths,
          limiter,
          progressContext,
        };
        if (llmCallContext !== undefined) {
          bigInput.llmCallContext = llmCallContext;
        }
        const [smallResult, bigResult] = await Promise.all([analyseSmallFiles(smallInput), analyseBigFiles(bigInput)]);
        // Mutable accumulator — Phase 5 enrichment will fold its own usage in
        // once Step 6 lands. Kept as an object so adding more contributors
        // later doesn't require turning consts back into lets.
        const tokenUsage = {
          inputTokens: smallResult.tokenUsage.inputTokens + bigResult.tokenUsage.inputTokens,
          outputTokens: smallResult.tokenUsage.outputTokens + bigResult.tokenUsage.outputTokens,
          costUsd: smallResult.tokenUsage.costUsd + bigResult.tokenUsage.costUsd,
        };

        // ── Phase 3: backfill (reused) ─────────────────────────────────────
        logger.info(`concept-graph: loading file-analysis cache`);
        throwIfCancelled(knowledgeId);
        const fileAnalysisCache = await FileAnalysisCache.loadAll(metaPaths);

        logger.info(`concept-graph: phase3 (backfill missing fields) starting`);
        throwIfCancelled(knowledgeId);
        await backfillMissingFields(metaPaths, fileAnalysisCache, limiter, llmCallContext, progressContext);

        // ── Phase 4: store files only (no folders, no repo) ───────────────
        progressContext.phaseChanged("indexing");
        logger.info(`concept-graph: phase4 (store files; no :Folder/:Repo) starting`);
        throwIfCancelled(knowledgeId);
        const storeResult = await storeFilesNoFolders({
          scope: { orgId, knowledgeId, repoId },
          metaPaths,
          cache: fileAnalysisCache,
          progressContext,
        });

        // ── Phase 5: per-file MCP enrichment ───────────────────────────────
        progressContext.phaseChanged("enrichment");
        logger.info(`concept-graph: phase5 (per-file MCP enrichment) starting`);
        throwIfCancelled(knowledgeId);
        const enrichInput: Parameters<typeof enrichFiles>[0] = {
          scope: { orgId, knowledgeId, repoId },
          metaPaths,
          cache: fileAnalysisCache,
          commitId: source.commitHash,
          progressContext,
        };
        if (llmCallContext !== undefined) {
          enrichInput.llmCallContext = llmCallContext;
        }
        const enrichResult = await enrichFiles(enrichInput);
        tokenUsage.inputTokens += enrichResult.tokenUsage.inputTokens;
        tokenUsage.outputTokens += enrichResult.tokenUsage.outputTokens;
        tokenUsage.costUsd += enrichResult.tokenUsage.costUsd;
        logger.info(
          `concept-graph: phase5 done — enriched=${enrichResult.filesEnriched} runId=${enrichResult.enrichmentRunId}`,
        );

        progressContext.completed();

        const totalFilesAnalyzed =
          smallResult.smallFilesAnalysed + smallResult.oversizedStubs + bigResult.processed + bigResult.cached;
        return {
          filesAnalyzed: totalFilesAnalyzed,
          foldersSummarised: 0,
          repoSummarised: false,
          graphNodesWritten: storeResult.nodesWritten,
          tokenUsage,
        };
      } catch (cause: unknown) {
        const { category, reason, detail } = classifyFailure(cause);
        progressContext.failed(reason, undefined, category, detail);
        throw cause;
      }
    },
  };
}
