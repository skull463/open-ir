// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { computeCacheKey, getCachedDecision, isCacheEnabled, recordDecision, recordHit } from "./cache.ts";
import { callOllama, resolveOllamaChain } from "./ollama.ts";
import { callOpenRouter, resolveOpenRouterChain } from "./openrouter.ts";

const DEFAULT_TIMEOUT_MS = 360_000;

export interface AskLlmOptions {
  model?: string;
  fallbackModels?: string[];
  timeoutMs?: number;
  systemPrompt?: string;
}

export interface AskLlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AskLlmResult {
  content: string;
  usage: AskLlmUsage;
}

export async function askLLM(prompt: string, opts: AskLlmOptions = {}): Promise<AskLlmResult> {
  const provider = getConfigValue(Config.LlmProvider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chain = provider === "ollama" ? resolveOllamaChain(opts) : resolveOpenRouterChain(opts);

  const cacheOn = isCacheEnabled();
  const cacheKey = cacheOn
    ? computeCacheKey({
        provider,
        prompt,
        systemPrompt: opts.systemPrompt ?? null,
        modelChain: chain,
      })
    : null;
  if (cacheOn && cacheKey !== null) {
    const cached = await getCachedDecision(cacheKey);
    if (cached !== null) {
      const saved = cached.usage.inputTokens + cached.usage.outputTokens;
      console.info(`[LLM CACHE HIT] key=${cacheKey.slice(0, 8)} tokens-saved=${saved}`);
      void recordHit(cacheKey);
      return { content: cached.content, usage: cached.usage };
    }
    console.info(`[LLM CACHE MISS] key=${cacheKey.slice(0, 8)}`);
  }

  const result =
    provider === "ollama" ? await callOllama(prompt, opts, timeoutMs) : await callOpenRouter(prompt, opts, timeoutMs);

  if (cacheOn && cacheKey !== null) {
    void recordDecision(cacheKey, {
      content: result.content,
      usage: result.usage,
      modelChain: chain,
    });
  }
  return result;
}
