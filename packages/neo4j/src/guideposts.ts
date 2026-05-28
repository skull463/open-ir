import type { AttachGuidepostInput, UpsertGuidepostInput } from "@bb/graph-core";
import { _runCypher } from "./client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// :Guidepost node — LLM-authored narrative observations. Canonical key:
// (orgId, knowledgeId, slug). `area` is a free-text scope descriptor; we keep
// it as a string property rather than promoting to a node so guideposts stay
// narrative, not relational.
// ─────────────────────────────────────────────────────────────────────────────

const UPSERT_GUIDEPOST = `
MERGE (g:Guidepost {orgId: $orgId, knowledgeId: $knowledgeId, slug: $slug})
ON CREATE SET g.kind = $kind,
              g.note = $note,
              g.area = $area,
              g.enrichmentRunId = $enrichmentRunId,
              g.createdAt = $now,
              g.updatedAt = $now
ON MATCH SET g.note = $note,
             g.area = $area,
             g.enrichmentRunId = $enrichmentRunId,
             g.updatedAt = $now
`;

export async function upsertGuidepost(input: UpsertGuidepostInput): Promise<void> {
  const now = new Date().toISOString();
  await _runCypher(UPSERT_GUIDEPOST, {
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    slug: input.slug,
    kind: input.kind,
    note: input.note,
    area: input.area,
    enrichmentRunId: input.enrichmentRunId,
    now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Polymorphic ABOUT edge. Exactly one of `targetFileRelativePath`,
// `targetConceptSlug`, `targetContractSlug` must be set; we throw rather than
// silently choose one when the input is ambiguous.
// ─────────────────────────────────────────────────────────────────────────────

const ATTACH_ABOUT_FILE = `
MATCH (g:Guidepost {orgId: $orgId, knowledgeId: $knowledgeId, slug: $guidepostSlug})
MATCH (target:File {knowledgeId: $knowledgeId, relativePath: $relativePath})
MERGE (g)-[r:ABOUT]->(target)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_ABOUT_CONCEPT = `
MATCH (g:Guidepost {orgId: $orgId, knowledgeId: $knowledgeId, slug: $guidepostSlug})
MATCH (target:Concept {orgId: $orgId, knowledgeId: $knowledgeId, slug: $targetSlug})
MERGE (g)-[r:ABOUT]->(target)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_ABOUT_CONTRACT = `
MATCH (g:Guidepost {orgId: $orgId, knowledgeId: $knowledgeId, slug: $guidepostSlug})
MATCH (target:Contract {orgId: $orgId, knowledgeId: $knowledgeId, slug: $targetSlug})
MERGE (g)-[r:ABOUT]->(target)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

export async function attachGuidepost(input: AttachGuidepostInput): Promise<void> {
  const targets = [
    input.targetFileRelativePath !== undefined ? "file" : null,
    input.targetConceptSlug !== undefined ? "concept" : null,
    input.targetContractSlug !== undefined ? "contract" : null,
  ].filter((t): t is string => t !== null);
  if (targets.length !== 1) {
    throw new Error(
      `attachGuidepost requires exactly one target, got ${targets.length}: ${targets.join(", ") || "(none)"}`,
    );
  }
  const now = new Date().toISOString();
  const base = {
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    guidepostSlug: input.guidepostSlug,
    enrichmentRunId: input.enrichmentRunId,
    now,
  };
  if (input.targetFileRelativePath !== undefined) {
    await _runCypher(ATTACH_ABOUT_FILE, { ...base, relativePath: input.targetFileRelativePath });
    return;
  }
  if (input.targetConceptSlug !== undefined) {
    await _runCypher(ATTACH_ABOUT_CONCEPT, { ...base, targetSlug: input.targetConceptSlug });
    return;
  }
  if (input.targetContractSlug !== undefined) {
    await _runCypher(ATTACH_ABOUT_CONTRACT, { ...base, targetSlug: input.targetContractSlug });
    return;
  }
  throw new Error("attachGuidepost: unreachable — targets validated above");
}
