// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import type { FileMetadataRow } from "@bb/graph-core";

import { _runCypher } from "#src/client.ts";

interface FileMetadataRawRow {
  path: string;
  language: string | null;
  sizeBytes: number | null;
  purpose: string | null;
  summary: string | null;
  businessContext: string | null;
  keywords: (string | null)[];
  classes: (string | null)[];
  functions: (string | null)[];
  importsInternal: (string | null)[];
  importsExternal: (string | null)[];
}

function filterStrings(items: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return out;
}

export async function fetchFileMetadata(knowledgeId: string, paths: readonly string[]): Promise<FileMetadataRow[]> {
  if (paths.length === 0) {
    return [];
  }

  const ids = paths.map((p) => `${knowledgeId}::${p}`);

  const cypher = `
    MATCH (f:File)
    WHERE f.id IN $ids
    OPTIONAL MATCH (f:File)-[:HAS_KEYWORD]->(kw:Keyword)
    OPTIONAL MATCH (f:File)-[:HAS_CLASS]->(c:Class)
    OPTIONAL MATCH (f:File)-[:HAS_FUNCTION]->(fn:Function)
    OPTIONAL MATCH (f:File)-[:HAS_IMPORT_INTERNAL]->(mi:Module)
    OPTIONAL MATCH (f:File)-[:HAS_IMPORT_EXTERNAL]->(me:Module)
    RETURN f.relativePath AS path, f.language AS language, f.sizeBytes AS sizeBytes, f.purpose AS purpose, f.summary AS summary, f.businessContext AS businessContext, collect(DISTINCT kw.name) AS keywords, collect(DISTINCT c.signature) AS classes, collect(DISTINCT fn.signature) AS functions, collect(DISTINCT mi.name) AS importsInternal, collect(DISTINCT me.name) AS importsExternal
  `;

  const rows = await _runCypher<FileMetadataRawRow>(cypher, { ids });

  return rows.map((row) => ({
    path: row.path,
    language: row.language,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    purpose: row.purpose,
    summary: row.summary,
    businessContext: row.businessContext,
    keywords: filterStrings(row.keywords),
    classes: filterStrings(row.classes),
    functions: filterStrings(row.functions),
    importsInternal: filterStrings(row.importsInternal),
    importsExternal: filterStrings(row.importsExternal),
  }));
}
