import type { FileAnalysis } from "@bb/mongo";
import { _runCypher } from "./client.ts";

const UPSERT_FILE = `
MERGE (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
SET f.language = $language,
    f.sha = $sha,
    f.sizeBytes = $sizeBytes,
    f.purpose = $purpose,
    f.summary = $summary,
    f.updatedAt = $updatedAt
WITH f
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
MERGE (k)-[:HAS_FILE]->(f)
`;

const CLEAR_KEYWORDS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_KEYWORD]->()
DELETE r
`;

const CLEAR_CLASSES = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_CLASS]->()
DELETE r
`;

const CLEAR_FUNCTIONS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_FUNCTION]->()
DELETE r
`;

const CLEAR_IMPORTS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})-[r:HAS_IMPORT]->()
DELETE r
`;

const ATTACH_KEYWORDS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $names AS name
MERGE (kw:Keyword {name: name})
MERGE (f)-[:HAS_KEYWORD]->(kw)
`;

const ATTACH_CLASSES = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $signatures AS signature
MERGE (c:Class {signature: signature})
MERGE (f)-[:HAS_CLASS]->(c)
`;

const ATTACH_FUNCTIONS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $signatures AS signature
MERGE (fn:Function {signature: signature})
MERGE (f)-[:HAS_FUNCTION]->(fn)
`;

const ATTACH_IMPORTS = `
MATCH (f:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
UNWIND $names AS name
MERGE (m:Module {name: name})
MERGE (f)-[:HAS_IMPORT]->(m)
`;

export interface UpsertFileNodeInput {
  knowledgeId: string;
  relativePath: string;
  language: string;
  sha: string;
  sizeBytes: number;
  analysis: FileAnalysis;
}

export async function upsertFileNode(input: UpsertFileNodeInput): Promise<void> {
  const params = { knowledgeId: input.knowledgeId, relativePath: input.relativePath };
  await _runCypher(UPSERT_FILE, {
    ...params,
    language: input.language,
    sha: input.sha,
    sizeBytes: input.sizeBytes,
    purpose: input.analysis.purpose,
    summary: input.analysis.summary,
    updatedAt: new Date().toISOString(),
  });

  await _runCypher(CLEAR_KEYWORDS, params);
  await _runCypher(CLEAR_CLASSES, params);
  await _runCypher(CLEAR_FUNCTIONS, params);
  await _runCypher(CLEAR_IMPORTS, params);

  if (input.analysis.keywords.length > 0) {
    await _runCypher(ATTACH_KEYWORDS, { ...params, names: input.analysis.keywords.map((k) => k.toLowerCase()) });
  }
  if (input.analysis.classes.length > 0) {
    await _runCypher(ATTACH_CLASSES, { ...params, signatures: input.analysis.classes });
  }
  if (input.analysis.functions.length > 0) {
    await _runCypher(ATTACH_FUNCTIONS, { ...params, signatures: input.analysis.functions });
  }
  if (input.analysis.imports.length > 0) {
    await _runCypher(ATTACH_IMPORTS, { ...params, names: input.analysis.imports });
  }
}
