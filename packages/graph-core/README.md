# `@bb/graph-core`

Provider-agnostic interfaces for the graph database layer.

## Responsibilities

Defines the contract that every graph database backend (Neo4j, etc.) must implement. Contains no I/O — pure TypeScript interfaces and shared input/output types.

## Public Interfaces

- `IGraphDatabaseProvider` — composite of all repository interfaces plus `connect`/`close`/`ping`/`runCypher`
- `IGraphKnowledgeRepository` — knowledge node CRUD in the graph
- `IGraphFileRepository` — file node upsert, delete, version snapshot
- `IGraphFolderRepository` — folder node upsert
- `IGraphRepoRepository` — repo node upsert
- `IGraphIndexRepository` — index creation
- `GraphPingResult` — health probe result shape
- Input types: `NodeScope`, `UpsertFileNodeInput`, `UpsertFolderNodeInput`, `UpsertRepoNodeInput`, `SnapshotFilesInput`, and summary payload types

## Data Ownership

None. This package owns no data — it only describes shapes.

## Tier

Strategy (interfaces consumed by `@bb/graph-db` and implemented by `@bb/neo4j`)
