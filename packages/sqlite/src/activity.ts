import type { ActivityInput } from "@bb/types";
import { getSqliteDb } from "./client.ts";

export async function recordActivity(input: ActivityInput): Promise<void> {
  const { response, ...rest } = input;
  const db = getSqliteDb();
  const doc = {
    identityId: rest.identityId,
    toolName: rest.toolName,
    query: rest.query,
    responseSnippet: response.slice(0, 500),
    durationMs: rest.durationMs,
    tokens_input: rest.tokens.input,
    tokens_output: rest.tokens.output,
    createdAt: new Date().toISOString(),
  };
  db.run("INSERT INTO activity (value) VALUES (?)", [JSON.stringify(doc)]);
}
