import { getSqliteDb } from "./client.ts";

export async function incrementUsage(
  identityId: string,
  inputTokenCount: number = 0,
  outputTokenCount: number = 0,
): Promise<void> {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;
  const key = `${identityId}:${year}:${month}`;

  const row = db.query("SELECT value FROM usage WHERE key = ?").get(key) as { value: string } | null;
  if (row) {
    const doc = JSON.parse(row.value);
    doc.requestCount += 1;
    doc.inputTokens += inputTokenCount;
    doc.outputTokens += outputTokenCount;
    doc.tokensUsed += inputTokenCount + outputTokenCount;
    doc.lastUpdated = now;
    db.run("UPDATE usage SET value = ? WHERE key = ?", [JSON.stringify(doc), key]);
  } else {
    const doc = {
      identityId,
      year,
      month,
      requestCount: 1,
      inputTokens: inputTokenCount,
      outputTokens: outputTokenCount,
      tokensUsed: inputTokenCount + outputTokenCount,
      lastUpdated: now,
      createdAt: now,
    };
    db.run("INSERT INTO usage (key, value) VALUES (?, ?)", [key, JSON.stringify(doc)]);
  }
}

export async function getMonthlyUsage(year: number, month: number): Promise<unknown[]> {
  const db = getSqliteDb();
  const rows = db
    .query("SELECT value FROM usage WHERE json_extract(value, '$.year') = ? AND json_extract(value, '$.month') = ?")
    .all(year, month) as { value: string }[];
  return rows.map((r) => {
    const doc = JSON.parse(r.value);
    return {
      identityId: doc.identityId,
      year: doc.year,
      month: doc.month,
      requestCount: doc.requestCount,
      inputTokens: doc.inputTokens,
      outputTokens: doc.outputTokens,
      tokensUsed: doc.tokensUsed,
      lastUpdated: new Date(doc.lastUpdated),
      createdAt: new Date(doc.createdAt),
    };
  });
}

export async function getGlobalUsage(): Promise<unknown[]> {
  const db = getSqliteDb();
  const row = db
    .query(
      `SELECT
         SUM(json_extract(value, '$.requestCount')) as totalRequests,
         SUM(json_extract(value, '$.inputTokens')) as totalInputTokens,
         SUM(json_extract(value, '$.outputTokens')) as totalOutputTokens,
         SUM(json_extract(value, '$.tokensUsed')) as totalTokens
       FROM usage`,
    )
    .get() as {
    totalRequests: number | null;
    totalInputTokens: number | null;
    totalOutputTokens: number | null;
    totalTokens: number | null;
  } | null;
  if (!row || row.totalRequests === null) {
    return [];
  }
  return [
    {
      _id: null,
      totalRequests: row.totalRequests ?? 0,
      totalInputTokens: row.totalInputTokens ?? 0,
      totalOutputTokens: row.totalOutputTokens ?? 0,
      totalTokens: row.totalTokens ?? 0,
    },
  ];
}
