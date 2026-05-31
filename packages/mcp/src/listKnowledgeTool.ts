import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UsageTracker } from "@bb/llm";
import { searchGraph } from "@bb/graph-db";
import type { KnowledgeListRow } from "@bb/graph-core";

const MAX_PAGE_CHARS = 20_000;

const description = `Discover indexed repositories and their knowledgeId UUIDs.

Always call this first when you need a knowledgeId and don't already
have one. Returns one row per indexed repo with repoName, sourceKind,
state, and fileCount. The knowledgeId is always a UUID — never guess
it from a repo name; pull it from this response.

State flow: CREATED → QUEUED → INGESTED → PROCESSING → PROCESSED |
FAILED. Treat any state other than PROCESSED as not-yet-queryable —
either back off or pick a different repo.

PARAMS:
- page: page number (default 1). Pages are packed to ~5000 tokens.`;

const schema = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
};

interface ListKnowledgeInput {
  page?: number | undefined;
}

interface ListKnowledgeResult {
  knowledgeBases: KnowledgeListRow[];
  totalItems: number;
  pagination: {
    page: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    hint?: string;
  };
}

export function registerListKnowledgeTool(server: McpServer): void {
  server.registerTool("list_knowledge", { description, inputSchema: schema }, async (args: ListKnowledgeInput) => {
    const startTime = Date.now();
    const result = await runListKnowledge(args);
    const payload = JSON.stringify(result, null, 2);
    const durationMs = Date.now() - startTime;

    // Track usage
    await UsageTracker.track("local-user", "list_knowledge", "list_knowledge", payload, durationMs);

    return { content: [{ type: "text" as const, text: payload }] };
  });
}

async function runListKnowledge(args: ListKnowledgeInput): Promise<ListKnowledgeResult> {
  const page = args.page ?? 1;
  const rows = await searchGraph.listKnowledgeBases();
  const totalItems = rows.length;
  const { pageRows, totalPages, safePage } = paginate(rows, page);

  const pagination: ListKnowledgeResult["pagination"] = {
    page: safePage,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
  if (safePage < totalPages) {
    pagination.hint = `Truncated. Call again with page: ${safePage + 1}.`;
  }

  return {
    knowledgeBases: pageRows,
    totalItems,
    pagination,
  };
}

interface PageSlice {
  pageRows: KnowledgeListRow[];
  totalPages: number;
  safePage: number;
}

function paginate(rows: KnowledgeListRow[], page: number): PageSlice {
  if (rows.length === 0) {
    return { pageRows: [], totalPages: 1, safePage: 1 };
  }
  const breaks: number[] = [0];
  let charBudget = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const cost = JSON.stringify(rows[i]).length;
    if (charBudget + cost > MAX_PAGE_CHARS && charBudget > 0) {
      breaks.push(i);
      charBudget = 0;
    }
    charBudget += cost;
  }
  breaks.push(rows.length);
  const totalPages = Math.max(1, breaks.length - 1);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = breaks[safePage - 1] ?? 0;
  const end = breaks[safePage] ?? rows.length;
  return { pageRows: rows.slice(start, end), totalPages, safePage };
}
