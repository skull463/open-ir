import type { RepoNameRow } from "@bb/graph-core";
import { _runCypher } from "#src/client.ts";

interface RawRow {
  knowledgeId: string;
  repoName: string | null;
}

export async function fetchRepoNames(knowledgeIds: readonly string[]): Promise<RepoNameRow[]> {
  if (knowledgeIds.length === 0) {
    return [];
  }
  const rows = await _runCypher<RawRow>(
    `MATCH (k:Knowledge) WHERE k.knowledgeId IN $ids
     RETURN k.knowledgeId AS knowledgeId, k.repoName AS repoName`,
    { ids: [...knowledgeIds] },
  );
  return rows.map((row) => ({
    knowledgeId: row.knowledgeId,
    repoName: row.repoName,
  }));
}
