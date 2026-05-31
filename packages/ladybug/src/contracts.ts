import type { AttachFileToContractInput, UpsertContractInput } from "@bb/graph-core";
import { _runCypher } from "./client.ts";

// ─────────────────────────────────────────────────────────────────────────────
// :Contract node. Canonical key: (orgId, knowledgeId, slug), collapsed into a
// surrogate `id` for LadybugDB's single-column PRIMARY KEY model. Same merge
// policy as :Concept (kind + createdAt first-write-wins, name/enrichmentRunId
// last-write-wins). A `:Contract` is a cross-file boundary — an interface,
// schema, event shape, or config key that multiple files reference.
// ─────────────────────────────────────────────────────────────────────────────

function contractId(orgId: string, knowledgeId: string, slug: string): string {
  return `${orgId}::${knowledgeId}::${slug}`;
}

function fileId(knowledgeId: string, relativePath: string): string {
  return `${knowledgeId}::${relativePath}`;
}

const UPSERT_CONTRACT = `
MERGE (c:Contract {id: $id})
ON CREATE SET c.orgId = $orgId,
              c.knowledgeId = $knowledgeId,
              c.slug = $slug,
              c.kind = $kind,
              c.name = $name,
              c.enrichmentRunId = $enrichmentRunId,
              c.createdAt = $now,
              c.updatedAt = $now
ON MATCH SET c.name = $name,
             c.enrichmentRunId = $enrichmentRunId,
             c.updatedAt = $now
`;

export async function upsertContract(input: UpsertContractInput): Promise<void> {
  const now = new Date().toISOString();
  await _runCypher(UPSERT_CONTRACT, {
    id: contractId(input.scope.orgId, input.scope.knowledgeId, input.slug),
    orgId: input.scope.orgId,
    knowledgeId: input.scope.knowledgeId,
    slug: input.slug,
    kind: input.kind,
    name: input.name,
    enrichmentRunId: input.enrichmentRunId,
    now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// File-to-contract edges. DEFINES vs CONSUMES are dispatched in JS (same
// reason as concept edges — relationship type is not parameterisable in MERGE).
// ─────────────────────────────────────────────────────────────────────────────

const ATTACH_DEFINES = `
MATCH (f:File {id: $fileId})
MATCH (c:Contract {id: $contractId})
MERGE (f)-[r:DEFINES]->(c)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

const ATTACH_CONSUMES = `
MATCH (f:File {id: $fileId})
MATCH (c:Contract {id: $contractId})
MERGE (f)-[r:CONSUMES]->(c)
ON CREATE SET r.enrichmentRunId = $enrichmentRunId, r.createdAt = $now
ON MATCH SET r.enrichmentRunId = $enrichmentRunId, r.updatedAt = $now
`;

export async function attachFileToContract(input: AttachFileToContractInput): Promise<void> {
  const now = new Date().toISOString();
  const params = {
    fileId: fileId(input.scope.knowledgeId, input.relativePath),
    contractId: contractId(input.scope.orgId, input.scope.knowledgeId, input.contractSlug),
    enrichmentRunId: input.enrichmentRunId,
    now,
  };
  switch (input.edgeKind) {
    case "DEFINES":
      await _runCypher(ATTACH_DEFINES, params);
      return;
    case "CONSUMES":
      await _runCypher(ATTACH_CONSUMES, params);
      return;
    default: {
      const _exhaustive: never = input.edgeKind;
      throw new Error(`Unknown contract edge kind: ${_exhaustive as string}`);
    }
  }
}
