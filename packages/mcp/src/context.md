# `@bb/mcp/src` — context

Implementation of `@bb/mcp`. See [../context.md](../context.md) for the
package-level contract; this file documents how the source tree is split.

`src/` is flat — no subdirectories. The repo-wide rule against parent
traversal makes nested layouts costly, and every other package in this
workspace keeps `src/` flat.

## Files

- **[index.ts](index.ts)** — public re-export surface. Exposes
  `mountMcp(app)` (idempotent registration of the four MCP HTTP routes
  on a supplied Express app) and `closeAllMcpSessions()` (drains both
  transport maps before the server shuts down). Owns a module-level
  `mounted` guard so a second `mountMcp` call is a no-op. Wraps every
  request handler in a `.catch()` that delegates to `sendError`, which
  emits a JSON 500 only when headers are still pending.
- **[server.ts](server.ts)** — `buildMcpServer()` constructs and
  returns the single `McpServer` instance. Owns the constants
  `SERVER_NAME = "bytebell-public"`, `SERVER_VERSION = "0.0.0"` (kept
  in sync with `package.json` manually), and the short `INSTRUCTIONS`
  string the SDK forwards in every initialize response. v1-step1 has
  no tools or resources — they are registered by follow-up files
  (`<tool>Tool.ts`, `resourcesSkills.ts`) that will plug in here.
- **[streamableHttpTransport.ts](streamableHttpTransport.ts)** — owns
  the per-session `Map<string, StreamableHTTPServerTransport>` for the
  modern transport. `handleStreamableHttp(req, res, server)` resolves
  an existing transport by `mcp-session-id` header or, on POST
  initialize requests, lazily constructs one whose
  `sessionIdGenerator` mints a `randomUUID` and whose
  `onsessioninitialized` registers the new id in the map. Each
  transport's `onclose` removes itself from the map.
  `closeAllStreamableHttpTransports()` drains the map and awaits
  `transport.close()` on each entry via `Promise.allSettled` so a
  single broken transport does not block shutdown.
- **[sseTransport.ts](sseTransport.ts)** — legacy SSE transport.
  `handleSseConnect` constructs a fresh `SSEServerTransport` per GET
  to `/sse`, registers it under its SDK-minted `sessionId`, and wires
  `res.on("close")` to drop the entry. `handleSseMessages` looks up
  the transport by the `sessionId` query string and forwards the POST
  body via `handlePostMessage`. Drain helper mirrors the streamable
  drain.

## Module dependency graph

```
server.ts                    → @modelcontextprotocol/sdk/server/mcp.js
streamableHttpTransport.ts   → node:crypto, express (types only),
                               @modelcontextprotocol/sdk/server/{mcp,streamableHttp}.js,
                               @modelcontextprotocol/sdk/types.js
sseTransport.ts              → express (types only),
                               @modelcontextprotocol/sdk/server/{mcp,sse}.js
index.ts                     → express (types only), server.ts,
                               streamableHttpTransport.ts, sseTransport.ts
```

No cycles. Transport modules each own a private `Map`; `index.ts`
composes them but does not reach inside.

## Invariants enforced here

- **`mountMcp` is idempotent.** A module-level `mounted` flag short-
  circuits repeat calls. Tests that re-import the package must reset
  via a fresh module instance, not by calling twice.
- **One `McpServer` per process.** `buildMcpServer()` is called exactly
  once, inside `mountMcp`. No global singleton — the instance is
  captured in closures held by the route handlers.
- **No express runtime dep.** Only types are imported (`import type {
Application, Request, Response } from "express"`). The runtime
  belongs to `@bb/server`.
- **No non-null assertions, no `any`, no dynamic `import()`.**
  Repo-wide strict-types rules apply — see CLAUDE.md.
- **Errors never leak as unhandled rejections.** Every `async`
  handler invocation in `index.ts` is `.catch()`-wrapped so an
  unexpected throw becomes a JSON 500 (or, if headers are already
  sent, a no-op).
- **Transports are owned, not leaked.** Both transport modules wire
  `onclose` / `res.on("close")` to remove themselves from their map.
  `closeAllMcpSessions` covers the rest at shutdown.

## Adding a tool (planned)

1. Create `src/<toolName>Tool.ts` exporting
   `register<ToolName>Tool(server: McpServer): void`.
2. Call it inside `buildMcpServer()` after the `new McpServer(...)`
   line and before the `return`.
3. Wire any new infra dep (`@bb/neo4j`, `@bb/mongo`, `@bb/config`)
   into `package.json` `dependencies`.
4. Update _Files_ + _Module dependency graph_ in this context.

## Adding a resource (planned)

1. Create `src/resources<Name>.ts` exporting
   `register<Name>Resources(server: McpServer): void`.
2. Same wiring as tools — call from inside `buildMcpServer()`.
