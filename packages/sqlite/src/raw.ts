import { getSqliteDb } from "./client.ts";
import type { RawFileDoc } from "@bb/db-core";

export async function upsertRawFile(doc: Omit<RawFileDoc, "updatedAt">): Promise<void> {
  const db = getSqliteDb();
  const key = `${doc.knowledgeId}:${doc.relativePath}`;
  const finalDoc: RawFileDoc = {
    ...doc,
    updatedAt: new Date(),
  };
  db.run(
    "INSERT INTO raw_files (key, knowledgeId, value) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, doc.knowledgeId, JSON.stringify(finalDoc)],
  );
}

export async function listRawFileShas(knowledgeId: string): Promise<Map<string, string>> {
  const db = getSqliteDb();
  const rows = db
    .query(
      "SELECT json_extract(value, '$.relativePath') as relativePath, json_extract(value, '$.sha') as sha FROM raw_files WHERE knowledgeId = ?",
    )
    .all(knowledgeId) as { relativePath: string; sha: string }[];

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.relativePath, row.sha);
  }
  return map;
}

export async function deleteRawFiles(knowledgeId: string, relativePaths: string[]): Promise<number> {
  if (relativePaths.length === 0) {
    return 0;
  }
  const db = getSqliteDb();
  const keys = relativePaths.map((p) => `${knowledgeId}:${p}`);
  const placeholders = keys.map(() => "?").join(",");
  const result = db.run(`DELETE FROM raw_files WHERE key IN (${placeholders})`, keys);
  return result.changes;
}
