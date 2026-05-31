# `@bb/graph-db`

Provider registry and facade for the graph database layer.

## Responsibilities

Maintains a map of named graph providers, exposes a single `getGraph()` accessor that delegates to the active provider. Provides convenience facade objects (`knowledgeGraph`, `filesGraph`, `foldersGraph`, `repoGraph`, `indexesGraph`, `searchGraph`) that proxy to the active provider's methods.

## Public Interfaces

- `registerGraphProvider(name, factory)` — register a provider (called at import time by `@bb/neo4j` and `@bb/ladybug`)
- `connectGraph(providerName)` — instantiate and connect a provider
- `closeGraph()` — close the active provider
- `getGraph()` — returns the active `IGraphDatabaseProvider`
- `knowledgeGraph`, `filesGraph`, `foldersGraph`, `repoGraph`, `indexesGraph` — write/CRUD facade objects proxying to `getGraph()`
- `conceptsGraph`, `contractsGraph`, `guidepostsGraph` — concept-graph (ConceptGraphStrategy) facade objects for `:Concept` / `:Contract` / `:Guidepost` writes
- `searchGraph` — read-side facade exposing `IGraphSearchRepository` (smart-search channels, keyword lookup, knowledge list, file metadata, repo-name hydration). Consumed by `@bb/mcp` to keep its tools provider-agnostic.
- `pingGraph()`, `runCypher()`, `toNeo4jInt()` — utility accessors

## Data Ownership

None. All I/O is delegated to the active provider.

## Tier

Strategy (consumer of `@bb/graph-core`, consumed by domain packages)
