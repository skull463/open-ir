# `@bb/mcp` — context

## Tier

Domain. Imports nothing from binaries (`@bb/server`, `@bb/cli`); does
not import from sibling domain packages. May reach into Infrastructure
(`@bb/config`, `@bb/neo4j`, `@bb/mongo` once retrieval lands) and Kernel
(`@bb/types`, `@bb/errors`).

## Responsibility

Owns the public MCP retrieval surface. Builds a single `McpServer`
instance from `@modelcontextprotocol/sdk`, mounts both Streamable HTTP
(`/mcp`) and legacy SSE (`/sse` + `/sse/messages`) transports onto an
externally-supplied Express application, and (in later steps) registers
the three retrieval tools (`smart_search`, `keyword_lookup`,
`retrieve_file`) plus the `bytebell://skills/...` resource channel.

For the v1-step1 landing this package is a transport skeleton only —
zero tools, zero resources, no auth. It exists so the rest of the
implementation can land tool-by-tool against a working `/mcp` route.

The package owns:

- A single shared `McpServer` instance (lazy, idempotent build) named
  `bytebell-public`, version pulled from this `package.json`.
- Per-session `StreamableHTTPServerTransport` instances keyed by
  `mcp-session-id`. New sessions are created on initialize requests;
  existing sessions are looked up by header.
- Per-session `SSEServerTransport` instances keyed by the SDK-generated
  `sessionId`, exposed via a query param on `/sse/messages`.
- Graceful shutdown — `closeAllMcpSessions()` closes every active
  transport so `@bb/server`'s shutdown hook can complete cleanly.

The package does **not** own:

- Auth or license gating. MCP is unauthenticated in the OSS engine —
  see [docs/mcp.md](../../docs/mcp.md) "Transport and mounting".
- Tool implementations (deferred to follow-up steps).
- Resource implementations (deferred).
- HTTP body parsing — relies on `@bb/server`'s top-level `express.json`.

## Public exports

```ts
function mountMcp(app: express.Application): void;
function closeAllMcpSessions(): Promise<void>;
```

`mountMcp` is idempotent — calling it twice on the same app is a
no-op (subsequent calls do not re-register routes or rebuild the server).

## Routes mounted

```
POST   /mcp                  Streamable HTTP — initialize / requests / responses
GET    /mcp                  Streamable HTTP — server-to-client streaming
DELETE /mcp                  Streamable HTTP — session terminate

GET    /sse                  SSE — open a long-lived stream
POST   /sse/messages?sessionId=…   SSE — client-to-server messages
```

## Data ownership

- Transient: per-session transport objects in two module-scoped `Map`s
  (one per transport flavour). Cleared on `transport.onclose` or
  `closeAllMcpSessions`. No persistence.

## Invariants

1. **One `McpServer` instance per process.** `mountMcp` uses a
   module-level guard so repeat calls do not rebuild.
2. **No `process.env` reads.** The instructions string is built from
   constants; future tunables go through `@bb/config`.
3. **No auth.** v1 ships unauthenticated. A future paid-tier could
   wrap the same `mountMcp` in a token check at the binary layer.
4. **Transports are owned, not leaked.** Every transport created here
   either lives in the per-flavour `Map` or has been closed.
   `closeAllMcpSessions` drains both maps.
5. **No non-null assertions, no `any`, no dynamic `import()`.** Repo-wide
   strict-types rules apply — see CLAUDE.md.

## External dependencies

- `@modelcontextprotocol/sdk@^1.23.0` — official TypeScript SDK
- `@types/express` (dev) — types only; we never import the express
  runtime, only its `Application | Request | Response` types

No workspace deps in step 1. Step 2+ will add `@bb/neo4j`, `@bb/mongo`,
`@bb/config`, `@bb/types` as the tools land.

## What is intentionally out of scope (v1-step1)

- Tool registrations (`smart_search`, `keyword_lookup`, `retrieve_file`)
- Resource registrations (`bytebell://skills/...`)
- Telemetry tagging (`mcp_tool_invoked` log lines)
- Authentication / license gating

## How to extend

Adding a new tool (planned step 3-5):

1. Create `src/<toolName>Tool.ts` exporting a
   `register<ToolName>Tool(server: McpServer): void`.
2. Call it from `buildMcpServer()` in `src/server.ts` after the
   `new McpServer(...)` line.
3. Update _Routes mounted_ stays unchanged; tools surface inside the
   existing `/mcp` initialize handshake.
4. Update _Public exports_ (no new export — tools register themselves
   on the server) and the package responsibility section.

Adding a transport flavour:

1. Add `src/<flavour>Transport.ts` mirroring the shape of
   `streamableHttpTransport.ts` (a `handle*` function plus a
   `closeAll*Transports` drain).
2. Mount it in `src/index.ts`'s `mountMcp` and call its drain in
   `closeAllMcpSessions`.
