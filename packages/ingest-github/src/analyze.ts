import { askLLM, type AskLlmUsage } from "@bb/llm";
import { logger } from "@bb/logger";
import type { FileAnalysis } from "@bb/mongo";
import {
  BIG_FILE_TOKEN_THRESHOLD,
  FALLBACK_LANGUAGE,
  FILE_ANALYSIS_FIELDS_BLOCK,
  emptyAnalysis,
  parseFileAnalysisJson,
  tokenLen,
  tryParse,
} from "./analysisShared.ts";
import { analyzeBigFile } from "./bigFile.ts";

export interface AnalyzedFile {
  language: string;
  analysis: FileAnalysis;
  usage: AskLlmUsage | null;
}

export async function analyzeFile(relativePath: string, content: string): Promise<AnalyzedFile> {
  const tokens = tokenLen(content);
  if (tokens > BIG_FILE_TOKEN_THRESHOLD) {
    logger.info(`analyzeFile: ${relativePath} (${tokens} tokens) → big-file path`);
    return await analyzeBigFile(relativePath, content);
  }

  logger.info(`analyzeFile: ${relativePath} (${tokens} tokens) → single-call path`);
  const prompt = buildPrompt(relativePath, content);
  let raw: string;
  let usage: AskLlmUsage;
  try {
    const result = await askLLM(prompt);
    raw = result.content;
    usage = result.usage;
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    logger.warn(`analyzeFile: askLLM failed for ${relativePath}: ${msg}`);
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis(), usage: null };
  }

  const parsed = tryParse(raw);
  if (parsed === null) {
    logger.warn(`analyzeFile: LLM response not valid JSON for ${relativePath}: ${raw.slice(0, 200)}`);
    return { language: FALLBACK_LANGUAGE, analysis: emptyAnalysis(), usage };
  }

  const { language, analysis } = parseFileAnalysisJson(parsed);
  logger.info(
    `analyzeFile: ${relativePath} done (model=${usage.model}, in=${usage.inputTokens}, out=${usage.outputTokens}, lang=${language})`,
  );
  return { language, analysis, usage };
}

function buildPrompt(relativePath: string, content: string): string {
  return `You are analyzing a single source file for a code knowledge graph.
Return ONLY a JSON object, no prose, no markdown fences, with EXACTLY these keys:

${FILE_ANALYSIS_FIELDS_BLOCK}

Do not invent line ranges — derive from the actual content.

File path: ${relativePath}
File content:
${content}`;
}
