# `@bb/sqlite/src`

SQLite implementation of the document database provider.

## Files

- **client.ts** — module-scoped `bun:sqlite` `Database` singleton, lifecycle (`connectSqlite`, `closeSqlite`), health probe (`pingSqlite`), schema initialization (tables: `knowledge`, `raw_files`, `activity`, `usage`)
- **knowledge.ts** — knowledge CRUD via JSON blobs: state transitions, commit tracking, progress updates, list/get/delete
- **raw.ts** — raw file upsert (keyed by `knowledgeId:relativePath`), SHA listing, batch delete
- **provider.ts** — `SqliteDatabaseProvider` class wiring all repositories; calls `registerDbProvider("sqlite", ...)` at import time
- **activity.ts** — activity record persistence
- **usage.ts** — token usage increment and aggregation
- **aggregateStats.ts** — global stats aggregation across tables
