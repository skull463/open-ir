// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import type { KnowledgeListRow } from "@bb/graph-core";

import { _runCypher } from "#src/client.ts";

interface KnowledgeListRawRow {
  knowledgeId: string | null;
  repoName: string | null;
  sourceKind: string | null;
  sourceUrl: string | null;
  branch: string | null;
  state: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileCount: number | { toNumber: () => number } | null;
}

export async function listKnowledgeBases(): Promise<KnowledgeListRow[]> {
  const cypher = `
    MATCH (k:Knowledge)
    OPTIONAL MATCH (k:Knowledge)-[:HAS_FILE]->(f:File)
    WITH k, count(f) AS fileCount
    RETURN k.knowledgeId AS knowledgeId, k.repoName AS repoName, k.sourceKind AS sourceKind, k.sourceUrl AS sourceUrl, k.branch AS branch, k.state AS state, k.createdAt AS createdAt, k.updatedAt AS updatedAt, fileCount
    ORDER BY k.updatedAt DESC
  `;
  const raw = await _runCypher<KnowledgeListRawRow>(cypher, {});
  return raw.map((row) => {
    let fileCount = 0;
    if (row.fileCount !== null) {
      fileCount = Number(row.fileCount);
    }
    return {
      knowledgeId: row.knowledgeId ?? "",
      repoName: row.repoName ?? "",
      sourceKind: row.sourceKind ?? "",
      sourceUrl: row.sourceUrl ?? "",
      branch: row.branch,
      state: row.state ?? "",
      createdAt: row.createdAt ?? "",
      updatedAt: row.updatedAt ?? "",
      fileCount,
    };
  });
}
