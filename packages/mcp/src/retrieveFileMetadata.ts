import { searchGraph } from "@bb/graph-db";

export interface FileMetadata {
  path: string;
  language: string;
  sizeBytes: number;
  purpose: string;
  summary: string;
  businessContext: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
}

export interface MetadataResult {
  operation: "metadata";
  knowledgeId: string;
  totalRequested: number;
  totalFound: number;
  files: FileMetadata[];
  notFound: string[];
}

export async function fetchMetadata(knowledgeId: string, relativePaths: readonly string[]): Promise<MetadataResult> {
  if (relativePaths.length === 0) {
    return {
      operation: "metadata",
      knowledgeId,
      totalRequested: 0,
      totalFound: 0,
      files: [],
      notFound: [],
    };
  }
  const rows = await searchGraph.fetchFileMetadata(knowledgeId, relativePaths);
  const files: FileMetadata[] = rows.map((row) => ({
    path: row.path,
    language: row.language ?? "plaintext",
    sizeBytes: Number(row.sizeBytes ?? 0),
    purpose: row.purpose ?? "",
    summary: row.summary ?? "",
    businessContext: row.businessContext ?? "",
    keywords: row.keywords,
    classes: row.classes,
    functions: row.functions,
    importsInternal: row.importsInternal,
    importsExternal: row.importsExternal,
  }));
  const found = new Set(files.map((file) => file.path));
  const notFound = relativePaths.filter((p) => !found.has(p));
  return {
    operation: "metadata",
    knowledgeId,
    totalRequested: relativePaths.length,
    totalFound: files.length,
    files,
    notFound,
  };
}
