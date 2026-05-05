import type { KnowledgeDoc, KnowledgeState } from "@bb/types";
import { _runCypher } from "./client.ts";

const UPSERT_KNOWLEDGE = `
MERGE (k:Knowledge {knowledgeId: $knowledgeId})
ON CREATE SET k.createdAt = $createdAt
SET k.sourceKind = $sourceKind,
    k.sourceUrl = $sourceUrl,
    k.branch = $branch,
    k.state = $state,
    k.updatedAt = $updatedAt
`;

const SET_STATE = `
MATCH (k:Knowledge {knowledgeId: $knowledgeId})
SET k.state = $state, k.updatedAt = $updatedAt
`;

export async function upsertKnowledgeNode(doc: KnowledgeDoc): Promise<void> {
  const sourceKind = doc.source.kind;
  const sourceUrl = doc.source.kind === "github" ? doc.source.repoUrl : doc.source.sourcePath;
  const branch = doc.source.kind === "github" ? (doc.source.branch ?? null) : null;
  await _runCypher(UPSERT_KNOWLEDGE, {
    knowledgeId: doc.knowledgeId,
    sourceKind,
    sourceUrl,
    branch,
    state: doc.status.state,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}

export async function setKnowledgeStateInGraph(knowledgeId: string, state: KnowledgeState): Promise<void> {
  await _runCypher(SET_STATE, {
    knowledgeId,
    state,
    updatedAt: new Date().toISOString(),
  });
}
