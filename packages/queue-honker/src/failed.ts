// Normalizes raw `_honker_dead` rows into the cross-provider `FailedJob`
// shape from `@bb/queue-core`. Honker stores `payload` as a JSON-encoded
// TEXT column and `died_at` as Unix seconds — both need conversion.
//
// `_honker_dead` columns (from `PRAGMA table_info`):
//   id, queue, payload, priority, run_at, attempts, max_attempts,
//   last_error, created_at, died_at

import { JobType } from "@bb/types";
import type { FailedJob } from "@bb/queue-core";

export function normalizeFailed(row: Record<string, unknown>): FailedJob {
  const payloadRaw = row["payload"];
  const payload: unknown = typeof payloadRaw === "string" ? safeParseJson(payloadRaw) : payloadRaw;
  const knowledgeId = extractKnowledgeId(payload);
  const queue = typeof row["queue"] === "string" ? row["queue"] : "";
  const diedAt = typeof row["died_at"] === "number" ? row["died_at"] : Date.now() / 1000;
  return {
    id: String(row["id"] ?? ""),
    type: queue as JobType,
    knowledgeId,
    attempts: typeof row["attempts"] === "number" ? row["attempts"] : 0,
    failedAt: new Date(diedAt * 1000).toISOString(),
    reason: typeof row["last_error"] === "string" ? row["last_error"] : "",
    payload,
  };
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractKnowledgeId(payload: unknown): string {
  if (payload !== null && typeof payload === "object" && "knowledgeId" in payload) {
    const v = (payload as { knowledgeId: unknown }).knowledgeId;
    return typeof v === "string" ? v : "";
  }
  return "";
}
