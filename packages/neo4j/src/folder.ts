import { _runCypher, _runInTransaction, type CypherStep } from "./client.ts";
import type { NodeScope } from "./repo.ts";

export interface FolderSummaryPayload {
  purpose: string;
  summary: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  dependencyGraph: string;
}

export interface UpsertFolderNodeInput {
  scope: NodeScope;
  folderPath: string;
  summary: FolderSummaryPayload;
}

const UPSERT_FOLDER = `
MERGE (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})
SET folder.purpose = $purpose,
    folder.summary = $summary,
    folder.dependencyGraph = $dependencyGraph,
    folder.updatedAt = $updatedAt
WITH folder
MATCH (r:Repo {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId})
MERGE (r)-[:CONTAINS]->(folder)
`;

const CLEAR_FOLDER_KEYWORDS = `
MATCH (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})-[rel:HAS_KEYWORD]->()
DELETE rel
`;

const ATTACH_FOLDER_KEYWORDS = `
MATCH (folder:Folder {orgId: $orgId, knowledgeId: $knowledgeId, repoId: $repoId, folderPath: $folderPath})
UNWIND $names AS name
MERGE (kw:Keyword {name: name})
MERGE (folder)-[:HAS_KEYWORD]->(kw)
`;

// ─────────────────────────────────────────────────────────────────────────────
// Batched folder upsert. Same Cypher shape as the single-shot path; wrapped
// with an outer UNWIND so one transaction lands every folder in the batch.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_UPSERT_FOLDERS = `
UNWIND $folders AS fld
MERGE (folder:Folder {orgId: fld.orgId, knowledgeId: fld.knowledgeId, repoId: fld.repoId, folderPath: fld.folderPath})
SET folder.purpose = fld.purpose,
    folder.summary = fld.summary,
    folder.dependencyGraph = fld.dependencyGraph,
    folder.updatedAt = $updatedAt
WITH folder, fld
MATCH (r:Repo {orgId: fld.orgId, knowledgeId: fld.knowledgeId, repoId: fld.repoId})
MERGE (r)-[:CONTAINS]->(folder)
`;

const BATCH_CLEAR_FOLDER_KEYWORDS = `
UNWIND $folders AS fld
MATCH (folder:Folder {orgId: fld.orgId, knowledgeId: fld.knowledgeId, repoId: fld.repoId, folderPath: fld.folderPath})-[rel:HAS_KEYWORD]->()
DELETE rel
`;

const BATCH_ATTACH_FOLDER_KEYWORDS = `
UNWIND $pairs AS p
MATCH (folder:Folder {orgId: p.orgId, knowledgeId: p.knowledgeId, repoId: p.repoId, folderPath: p.folderPath})
MERGE (kw:Keyword {name: p.name})
MERGE (folder)-[:HAS_KEYWORD]->(kw)
`;

export async function upsertFolderNodesBatch(inputs: readonly UpsertFolderNodeInput[]): Promise<void> {
  if (inputs.length === 0) {
    return;
  }
  const updatedAt = new Date().toISOString();
  const folders = inputs.map((input) => ({
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    repoId: input.scope.repoId,
    folderPath: input.folderPath,
    purpose: input.summary.purpose,
    summary: input.summary.summary,
    dependencyGraph: input.summary.dependencyGraph,
  }));
  const folderKeys = inputs.map((input) => ({
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    repoId: input.scope.repoId,
    folderPath: input.folderPath,
  }));
  const keywordPairs: Array<Record<string, string>> = [];
  for (const input of inputs) {
    for (const raw of input.summary.keywords) {
      keywordPairs.push({
        orgId: input.scope.orgId,
        knowledgeId: input.scope.knowledgeId,
        repoId: input.scope.repoId,
        folderPath: input.folderPath,
        name: raw.toLowerCase(),
      });
    }
  }

  const steps: CypherStep[] = [
    { query: BATCH_UPSERT_FOLDERS, params: { folders, updatedAt } },
    { query: BATCH_CLEAR_FOLDER_KEYWORDS, params: { folders: folderKeys } },
  ];
  if (keywordPairs.length > 0) {
    steps.push({ query: BATCH_ATTACH_FOLDER_KEYWORDS, params: { pairs: keywordPairs } });
  }

  await _runInTransaction(steps);
}

export async function upsertFolderNode(input: UpsertFolderNodeInput): Promise<void> {
  const scope = input.scope;
  const params = {
    orgId: scope.orgId,
    knowledgeId: scope.knowledgeId,
    repoId: scope.repoId,
    folderPath: input.folderPath,
  };
  await _runCypher(UPSERT_FOLDER, {
    ...params,
    purpose: input.summary.purpose,
    summary: input.summary.summary,
    dependencyGraph: input.summary.dependencyGraph,
    updatedAt: new Date().toISOString(),
  });
  await _runCypher(CLEAR_FOLDER_KEYWORDS, params);
  if (input.summary.keywords.length > 0) {
    await _runCypher(ATTACH_FOLDER_KEYWORDS, {
      ...params,
      names: input.summary.keywords.map((k) => k.toLowerCase()),
    });
  }
}
