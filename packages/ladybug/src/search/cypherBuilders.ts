// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import type { SmartSearchChannelInput } from "@bb/graph-core";

// LadybugDB struggles with `$param IS NULL` due to strict typing.
// Build WHERE dynamically so the engine only parses conditions that exist.
export function buildSharedFilters(input: SmartSearchChannelInput, fileAlias = "f"): string {
  const conditions: string[] = [];

  if (input.knowledgeId) {
    conditions.push(`${fileAlias}.knowledgeId = $knowledgeId`);
  }
  if (input.pathPrefix) {
    conditions.push(`${fileAlias}.relativePath STARTS WITH $pathPrefix`);
  }

  input.excludeSuffixes.forEach((_, i) => {
    conditions.push(`NOT toLower(${fileAlias}.relativePath) ENDS WITH $excludeSuffix_${i}`);
  });
  input.excludeContains.forEach((_, i) => {
    conditions.push(`NOT toLower(${fileAlias}.relativePath) CONTAINS $excludeContains_${i}`);
  });

  return conditions.length > 0 ? conditions.join(" AND ") : "1=1";
}

// Replaces Neo4j list comprehensions with OLAP-friendly CASE WHEN statements.
export function buildScoringMath(fields: string[], termCount: number): string {
  const caseStatements: string[] = [];
  for (let i = 0; i < termCount; i++) {
    const fieldChecks = fields.map((f) => `toLower(${f}) CONTAINS $queryTerm_${i}`).join(" OR ");
    caseStatements.push(`(CASE WHEN ${fieldChecks} THEN 1.0 ELSE 0.0 END)`);
  }
  return `(${caseStatements.join(" + ")}) / ${termCount.toFixed(1)}`;
}

// Builds the OR conditions to match ANY of the query terms.
export function buildTermMatcher(fields: string[], termCount: number): string {
  const conditions: string[] = [];
  for (let i = 0; i < termCount; i++) {
    fields.forEach((f) => {
      conditions.push(`toLower(${f}) CONTAINS $queryTerm_${i}`);
    });
  }
  return conditions.length > 0 ? `(${conditions.join(" OR ")})` : "1=1";
}
