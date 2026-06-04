# `@bb/ladybug/src/search`

Read-side graph queries for the LadybugDB / KuzuDB provider. Each file
owns exactly one of the five `IGraphSearchRepository` operations consumed
by `@bb/mcp`. Wired into the provider as a single namespace import:
`provider.ts` does `import * as searchRepo from "./search/index.ts"` and
hangs the functions off `LadybugGraphProvider.search`.

## Tier

Infrastructure (sub-folder of `@bb/ladybug`).

## Files

- `index.ts` — barrel; re-exports the five public functions consumed by
  `provider.ts`. Has no logic of its own.
- `smartSearch.ts` — `runSmartSearchChannel(channel, input)`. Dispatches
  the seven smart-search channels (`purpose`, `businessContext`, `paths`,
  `keywords`, `classes`, `functions`, `importsInternal`,
  `importsExternal`) onto channel-specific cypher templates. Returns
  `ScoredHit[]`. Builds parameters as flat scalars (`queryTerm_<i>`,
  `excludeSuffix_<i>`, …) to dodge LadybugDB's strict-typing dialect
  around list-indexing and `IS NULL`.
- `keywordLookup.ts` — `keywordLookup(input)`. Reverse-lookup over named
  entities: `Keyword`, `Module`, `Class`, `Function`. Picks the cypher
  template from `input.match`; caps results via `keywordLimit *
filesPerKeyword`.
- `listKnowledge.ts` — `listKnowledgeBases()`. Returns one row per
  indexed repo with `fileCount` (computed via `OPTIONAL MATCH ...
count(f)`) ordered by `updatedAt DESC`. Fuels the MCP
  `list_knowledge` tool.
- `fileMetadata.ts` — `fetchFileMetadata(knowledgeId, paths)`. Bulk
  metadata read for `retrieve_file` metadata mode. Resolves files by
  composite id `${knowledgeId}::${relativePath}`; collects keywords,
  classes, functions, internal/external imports per file. The private
  `filterStrings` helper drops `null` and empty entries from cypher
  `collect()` outputs.
- `repoNames.ts` — `fetchRepoNames(knowledgeIds)`. `(knowledgeId,
repoName)` projection used to label retrieval results.
- `cypherBuilders.ts` — shared cypher-fragment builders used by
  `smartSearch.ts`: `buildSharedFilters` (knowledge / path-prefix /
  exclusion WHERE clause), `buildScoringMath` (CASE-WHEN sum, replaces
  Neo4j list comprehensions for OLAP-friendly execution), and
  `buildTermMatcher` (OR-of-CONTAINS across query terms).

## Imports allowed

- Within this folder: siblings may import each other (e.g.
  `smartSearch.ts` imports `cypherBuilders.ts`).
- Up into the parent package: `#src/client.ts` only (for `_runCypher`),
  never relative parent traversal.
- Cross-package: `@bb/graph-core` (types).
- Forbidden: importing from `../knowledge.ts`, `../files.ts`, or any
  other write-side ladybug module — search is read-only.

## Invariants

- Every file is ≤ 300 lines (Rule of File Size).
- No writes. These functions only run `_runCypher` for MATCH/RETURN
  queries; they never call `CREATE`, `MERGE`, `SET`, or `DELETE`.
- All cypher parameters are flat scalars or string arrays. No nested
  objects, no list-indexing in WHERE — LadybugDB rejects both.
- Return shapes match `IGraphSearchRepository` (defined in
  `@bb/graph-core`) so the provider's `search` namespace satisfies the
  interface without adapter layers.
