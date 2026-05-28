import type { Application, Request, Response } from "express";
import { buildMcpServer } from "./server.ts";
import { closeAllStreamableHttpTransports, handleStreamableHttp } from "./streamableHttpTransport.ts";
import { closeAllSseTransports, handleSseConnect, handleSseMessages } from "./sseTransport.ts";

let mounted = false;

export function mountMcp(app: Application): void {
  if (mounted) {
    return;
  }
  mounted = true;
  const buildServer = (): ReturnType<typeof buildMcpServer> => buildMcpServer();

  const streamable = (req: Request, res: Response): void => {
    handleStreamableHttp(req, res, buildServer).catch((cause: unknown) => {
      sendError(res, cause);
    });
  };
  app.post("/mcp", streamable);
  app.get("/mcp", streamable);
  app.delete("/mcp", streamable);

  app.get("/sse", (req: Request, res: Response): void => {
    handleSseConnect(req, res, buildServer).catch((cause: unknown) => {
      sendError(res, cause);
    });
  });
  app.post("/sse/messages", (req: Request, res: Response): void => {
    handleSseMessages(req, res).catch((cause: unknown) => {
      sendError(res, cause);
    });
  });
}

export async function closeAllMcpSessions(): Promise<void> {
  await Promise.all([closeAllStreamableHttpTransports(), closeAllSseTransports()]);
}

// ─────────────────────────────────────────────────────────────────────────────
// In-process tool runners. Exported so callers running in the same process
// (today: `@bb/ingest-github`'s ConceptGraphStrategy enrichment phase) can
// invoke the exact same logic the MCP transport invokes, without round-
// tripping through HTTP/SSE. The transport handlers wrap these with usage
// tracking and response trimming; in-process callers accept full payloads
// and aggregate usage at their own layer.
// ─────────────────────────────────────────────────────────────────────────────

export { runSmartSearch } from "./smartSearchTool.ts";
export type { SmartSearchInput } from "./smartSearchTool.ts";
export type { SmartSearchResult, ConceptCluster, FusedResult, Cluster } from "./smartSearchFusion.ts";

export { runKeywordLookup } from "./keywordLookupTool.ts";
export type { KeywordLookupInput, KeywordLookupResult } from "./keywordLookupTool.ts";

export { fetchMetadata } from "./retrieveFileMetadata.ts";
export type { FileMetadata, MetadataResult } from "./retrieveFileMetadata.ts";
export { readFileRange } from "./retrieveFileContent.ts";
export type { ContentOptions, ContentResult, ContentRangeResult, ContentSearchResult } from "./retrieveFileContent.ts";
export { bulkSearch } from "./retrieveFileBulk.ts";
export type { BulkSearchOptions, BulkSearchResult, BulkMatchedFile } from "./retrieveFileBulk.ts";

function sendError(res: Response, cause: unknown): void {
  if (res.headersSent) {
    return;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  res.status(500).json({ error: message });
}
