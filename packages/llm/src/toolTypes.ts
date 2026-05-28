import type { AskLlmUsage, LlmProviderName } from "./client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Tool-use loop public types. The actual loop driver lives in `toolLoop.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tool the LLM is allowed to call. `parameters` is a JSON Schema describing
 * the input shape — callers typically generate this from a Zod schema via
 * `zod-to-json-schema` so the runtime validator and the model's schema stay
 * in sync. We do not validate `parameters` here; we pass it through to the
 * provider verbatim.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Returned each iteration so callers can audit what the model invoked. */
export interface ToolInvocation {
  /** Tool name the model called. */
  name: string;
  /** Parsed JSON arguments the model produced. */
  input: Record<string, unknown>;
  /** Whatever `executeTool` returned (truncated representation, not the live object). */
  output: unknown;
  /** True if this invocation hit the per-result truncation cap. */
  outputTruncated: boolean;
}

/**
 * How the loop ended.
 *
 * - `completed` — model returned a terminal assistant message (text content,
 *   no further tool calls).
 * - `max-iterations` — hit `maxIterations` with the model still wanting to
 *   call tools. Partial state returned; caller decides whether to fail.
 * - `max-tool-calls` — hit `maxToolCalls` mid-iteration.
 * - `wall-time-exceeded` — `wallTimeMs` elapsed.
 * - `empty-response` — model returned neither content nor tool_calls.
 *
 * Provider errors (HTTP 4xx/5xx, network, timeout on individual request) are
 * raised as `LlmError` and never converted to a termination reason — the
 * caller catches and classifies them separately.
 */
export type LoopTerminationReason =
  | "completed"
  | "max-iterations"
  | "max-tool-calls"
  | "wall-time-exceeded"
  | "empty-response";

export interface AskLLMWithToolsOptions {
  prompt: string;
  systemPrompt?: string;
  tools: ToolDefinition[];
  /**
   * Invoked once per tool call the model makes. Receives the parsed arguments
   * and must return a JSON-serialisable result. Throwing here propagates out
   * of `askLLMWithTools` as an `LlmError` with the tool name in the message.
   */
  executeTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  model?: string;
  fallbackModels?: string[];
  /** Per-call API key override (same semantics as `AskLlmOptions.apiKey`). */
  apiKey?: string;
  /** Per-call provider override. Only `"openrouter"` is supported for tool use. */
  provider?: LlmProviderName;
  /** Per-iteration HTTP timeout. The full loop is bounded by `wallTimeMs`. */
  perRequestTimeoutMs?: number;
  /** Hard cap on iterations (one round of tool calls + model response = 1 iteration). */
  maxIterations: number;
  /** Hard cap on total tool invocations across the loop. */
  maxToolCalls: number;
  /** Hard wall-clock cap for the whole loop. */
  wallTimeMs: number;
  /** Truncation cap for each tool result string before it goes back to the model. */
  maxToolResultChars?: number;
}

export interface AskLLMWithToolsResult {
  /**
   * Final assistant content. Present iff `terminationReason === "completed"`.
   * Empty string when a cap fires before the model produced a terminal turn.
   */
  content: string;
  /** Cumulative input + output tokens + cost across every iteration. */
  usage: AskLlmUsage;
  toolCalls: ToolInvocation[];
  iterations: number;
  terminationReason: LoopTerminationReason;
}
