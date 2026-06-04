import type { AttachGuidepostInput, UpsertGuidepostInput } from "@bb/graph-core";
import { _runCypher } from "./client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// :Guidepost node — LLM-authored narrative observations. Canonical key:
// (orgId, knowledgeId, slug), collapsed into a surrogate `id` for LadybugDB's
// single-column PRIMARY KEY model. `area` is a free-text scope descriptor; we
// keep it as a string property rather than promoting to a node so guideposts
// stay narrative, not relational.
// ─────────────────────────────────────────────────────────────────────────────

function scopedId(orgId: string, knowledgeId: string, slug: string): string {
  return `${orgId}::${knowledgeId}::${slug}`;
}

function fileId(knowledgeId: string, relativePath: string): string {
  return `${knowledgeId}::${relativePath}`;
}

const UPSERT_GUIDEPOST = `
MERGE (g:Guidepost {id: $id})
ON CREATE SET g.orgId = $orgId,
              g.knowledgeId = $knowledgeId,
              g.slug = $slug,
              g.kind = $kind,
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
    id: scopedId(input.scope.orgId, input.scope.knowledgeId, input.slug),
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
MATCH (g:Guidepost {id: $guidepostId})
MATCH (target:File {id: $targetId})
MERGE (g)-[r:ABOUT]->(target)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_ABOUT_CONCEPT = `
MATCH (g:Guidepost {id: $guidepostId})
MATCH (target:Concept {id: $targetId})
MERGE (g)-[r:ABOUT]->(target)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_ABOUT_CONTRACT = `
MATCH (g:Guidepost {id: $guidepostId})
MATCH (target:Contract {id: $targetId})
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
    guidepostId: scopedId(input.scope.orgId, input.scope.knowledgeId, input.guidepostSlug),
    enrichmentRunId: input.enrichmentRunId,
    now,
  };
  if (input.targetFileRelativePath !== undefined) {
    await _runCypher(ATTACH_ABOUT_FILE, {
      ...base,
      targetId: fileId(input.scope.knowledgeId, input.targetFileRelativePath),
    });
    return;
  }
  if (input.targetConceptSlug !== undefined) {
    await _runCypher(ATTACH_ABOUT_CONCEPT, {
      ...base,
      targetId: scopedId(input.scope.orgId, input.scope.knowledgeId, input.targetConceptSlug),
    });
    return;
  }
  if (input.targetContractSlug !== undefined) {
    await _runCypher(ATTACH_ABOUT_CONTRACT, {
      ...base,
      targetId: scopedId(input.scope.orgId, input.scope.knowledgeId, input.targetContractSlug),
    });
    return;
  }
  throw new Error("attachGuidepost: unreachable — targets validated above");
}
