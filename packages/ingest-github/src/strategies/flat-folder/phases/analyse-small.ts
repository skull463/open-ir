import { logger } from "@bb/logger";
import type { AskLlmOptions } from "@bb/llm";
import { LlmConfigError, LlmError } from "@bb/errors";
import type { ArchiveSink, FileAnalyzer, ScannedFile, SourceReader } from "#src/types/pipeline.ts";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import type { ConcurrencyLimiter } from "#src/pipeline/concurrency.ts";
import { throwIfCancelled, CancellationError } from "#src/pipeline/cancellation.ts";
import { analyseScannedFile, buildOversizedStub } from "#src/strategies/flat-folder/analyse-file.ts";
import { saveCondensed } from "#src/strategies/flat-folder/big-file/storage.ts";
import type { ScanManifest } from "#src/strategies/flat-folder/scan-manifest.ts";

export interface AnalyseSmallInput {
  knowledgeId: string;
  manifest: ScanManifest;
  source: SourceReader;
  metaPaths: MetaPaths;
  analyzer: FileAnalyzer;
  limiter: ConcurrencyLimiter;
  archiveSink?: ArchiveSink;
  llmCallContext?: AskLlmOptions;
  progressContext?: ProgressContext;
}

export interface AnalyseSmallResult {
  smallFilesAnalysed: number;
  oversizedStubs: number;
  failed: number;
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number };
}

/**
 * Consumes the `scan-manifest.json` produced by `scanAndClassify` and
 * analyses every `kind: "small"` entry through the shared LLM limiter.
 *
 * Oversized stubs are also written here (they don't go through the LLM but
 * still need a placeholder analysis row on disk so downstream phases see a
 * complete file set).
 */
export async function analyseSmallFiles(input: AnalyseSmallInput): Promise<AnalyseSmallResult> {
  const smallEntries = input.manifest.entries.filter((e) => e.kind === "small");
  const oversizedEntries = input.manifest.entries.filter((e) => e.kind === "oversized");

  let smallFilesAnalysed = 0;
  let oversizedStubs = 0;
  let failed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const reporter = input.progressContext?.reporter({
    phase: "file_analysis",
    subPhase: "analyse_small",
    total: { kind: "fixed", total: smallEntries.length + oversizedEntries.length },
  });
  await reporter?.start();

  try {
    for (const entry of oversizedEntries) {
      throwIfCancelled(input.knowledgeId);
      try {
        await saveCondensed(input.metaPaths, buildOversizedStub(entry.relativePath, entry.sizeBytes));
        oversizedStubs += 1;
      } catch (cause: unknown) {
        failed += 1;
        logger.warn(`analyse-small: oversized stub write failed for ${entry.relativePath}: ${describe(cause)}`);
      }
      reporter?.increment(1, { fileName: entry.relativePath });
    }

    const pending: Promise<void>[] = [];
    for (const entry of smallEntries) {
      pending.push(
        input.limiter(async () => {
          throwIfCancelled(input.knowledgeId);
          try {
            const content = await input.source.readFile(entry.relativePath);
            const scanned: ScannedFile = {
              kind: "file",
              relativePath: entry.relativePath,
              absolutePath: entry.absolutePath,
              sizeBytes: entry.sizeBytes,
              content,
            };
            const condensed = await analyseScannedFile(input.analyzer, scanned, input.llmCallContext);
            await saveCondensed(input.metaPaths, condensed);
            if (input.archiveSink !== undefined) {
              await input.archiveSink.push({
                knowledgeId: input.knowledgeId,
                relativePath: entry.relativePath,
                content,
              });
            }
            if (condensed.tokenUsage) {
              totalInputTokens += condensed.tokenUsage.inputTokens;
              totalOutputTokens += condensed.tokenUsage.outputTokens;
              totalCostUsd += condensed.tokenUsage.costUsd;
            }
            smallFilesAnalysed += 1;
            reporter?.increment(1, { fileName: entry.relativePath });
          } catch (cause: unknown) {
            if (cause instanceof CancellationError) {
              throw cause;
            }
            if (cause instanceof LlmConfigError || cause instanceof LlmError) {
              throw cause;
            }
            failed += 1;
            logger.warn(`analyse-small: analyse failed for ${entry.relativePath}: ${describe(cause)}`);
            reporter?.increment(1, { fileName: entry.relativePath });
          }
        }),
      );
    }
    await Promise.all(pending);
  } finally {
    reporter?.stop();
  }

  logger.info(
    `analyse-small done: smallFilesAnalysed=${smallFilesAnalysed} oversizedStubs=${oversizedStubs} failed=${failed}`,
  );
  return {
    smallFilesAnalysed,
    oversizedStubs,
    failed,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd },
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
