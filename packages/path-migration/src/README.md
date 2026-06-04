# `@bb/path-migration/src`

Implementation of `@bb/path-migration`. See [../README.md](../README.md) for the package-level contract.

## Files

- **[index.ts](index.ts)** — Public entrypoint. Re-exports `migrateLegacyPaths`, `hasLegacyLayout`, and the summary/input types.
- **[migrate-legacy-paths.ts](migrate-legacy-paths.ts)** — Orchestrator. Runs `migrateOne` per supplied doc, then `sweepOrphans` for the on-disk remainder, accumulating one `MigrationSummary`.
- **[move.ts](move.ts)** — The disk moves: clone + meta-output relocation, business-context flattening, and `pathExists` / cross-device `renameOrCopy` helpers. Records skip/fail reasons; never throws on an expected skip.
- **[orphan-sweep.ts](orphan-sweep.ts)** — `hasLegacyLayout` (the boot guard predicate) and `sweepOrphans`, which deletes legacy dirs with no backing DB record and drops a now-empty `.meta`.
- **[types.ts](types.ts)** — `MigrationSummary` and `MigrateLegacyPathsInput`.
