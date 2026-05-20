# `@bb/graph-db/src`

Provider registry, facade, and lifecycle management for the graph database layer.

## Files

- **index.ts** — provider registry (`registerGraphProvider`, `connectGraph`, `closeGraph`, `getGraph`), convenience facade objects (`knowledge`, `files`, `folders`, `repo`, `indexes`), and `pingGraph()`, `runCypher()`, `toNeo4jInt()`
