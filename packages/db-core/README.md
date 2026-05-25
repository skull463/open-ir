# `@bb/db-core`

Provider-agnostic interfaces for the document database layer.

## Responsibilities

Defines the contract that every document database backend (Mongo, SQLite, etc.) must implement. Contains no I/O — pure TypeScript interfaces and shared types.

## Public Interfaces

- `IDocumentDatabaseProvider` — composite of all repository interfaces plus `connect`/`close`/`ping`
- `IKnowledgeRepository` — CRUD for knowledge entries
- `IRawRepository` — upsert, list SHA map, delete raw file docs
- `IAggregateStatsRepository` — `aggregateStats()`
- `IActivityRepository` — `recordActivity()`
- `IUsageRepository` — `incrementUsage`, `getMonthlyUsage`, `getGlobalUsage`
- `DbPingResult` — health probe result shape
- `FileAnalysis`, `RawFileDoc` — shared raw-file types (previously duplicated in `@bb/mongo`)

## Data Ownership

None. This package owns no data — it only describes shapes.

## Tier

Strategy (interfaces consumed by `@bb/db` and implemented by `@bb/mongo`, `@bb/sqlite`)
