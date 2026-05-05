import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SERVER_NAME = "bytebell-public";
const SERVER_VERSION = "0.0.0";

const INSTRUCTIONS = `Bytebell-public local knowledge graph.

This server exposes a small, single-tenant MCP retrieval surface for code
indexed locally by bytebell-server. Available tools (registered in
follow-up steps): smart_search, keyword_lookup, retrieve_file. Available
resources (registered in follow-up steps): bytebell://skills/index and
bytebell://skills/{name}/{filename}.

Fetch bytebell://skills/index once per session, install the listed files
to ~/.claude/skills/bytebell/, then invoke the tools listed there.`;

export function buildMcpServer(): McpServer {
  return new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
}
