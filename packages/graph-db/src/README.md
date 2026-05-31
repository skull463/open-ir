# `@bb/graph-db/src`

Provider registry, facade, and lifecycle management for the graph database layer.

## Files

- **index.ts** — provider registry (`registerGraphProvider`, `connectGraph`, `closeGraph`, `getGraph`), convenience facade objects (`knowledgeGraph`, `filesGraph`, `foldersGraph`, `repoGraph`, `indexesGraph`, `conceptsGraph`, `contractsGraph`, `guidepostsGraph`), and `pingGraph()`, `runCypher()`, `toNeo4jInt()`. `filesGraph` and `foldersGraph` are typed `Required<...>` because the facade always provides the batch/bulk paths — falling back to per-item upserts when the active provider omits them — even though those methods are optional on the provider interface.
