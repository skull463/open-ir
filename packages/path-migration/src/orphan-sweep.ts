import path from "node:path";
import { readdir, rm } from "node:fs/promises";
import { pathExists } from "./move.ts";
import type { MigrationSummary } from "./types.ts";

const LEGACY_META = ".meta";

/**
 * True if a legacy `repos/.meta/` tree with at least one entry exists. An empty
 * `.meta` dir is vestigial and reported as absent — it never blocks boot.
 */
export async function hasLegacyLayout(home: string): Promise<boolean> {
  const metaRoot = path.join(home, "repos", LEGACY_META);
  try {
    const entries = await readdir(metaRoot);
    return entries.length > 0;
  } catch {
    return false;
  }
}

interface SweepInput {
  home: string;
  knownIds: ReadonlySet<string>;
  dryRun: boolean;
  summary: MigrationSummary;
}

/**
 * Deletes legacy `repos/<id>` + `repos/.meta/<id>` dirs whose id has no backing
 * DB record. These are unrecoverable — there is no doc to derive a commit-scoped
 * target — so they are dropped and reported as `abandoned`. Under `dryRun`,
 * nothing is removed; the ids are still reported.
 */
export async function sweepOrphans(input: SweepInput): Promise<void> {
  const reposRoot = path.join(input.home, "repos");
  const metaRoot = path.join(reposRoot, LEGACY_META);

  const onDiskIds = new Set<string>();
  for (const name of await listDirNames(reposRoot)) {
    if (name !== LEGACY_META) {
      onDiskIds.add(name);
    }
  }
  for (const name of await listDirNames(metaRoot)) {
    onDiskIds.add(name);
  }

  for (const id of onDiskIds) {
    if (input.knownIds.has(id)) {
      continue; // backed by a DB record — handled (or skipped) by migrateOne, never abandoned
    }
    if (!input.dryRun) {
      await rm(path.join(reposRoot, id), { recursive: true, force: true });
      await rm(path.join(metaRoot, id), { recursive: true, force: true });
    }
    input.summary.abandoned.push(id);
  }
  // Drop a now-empty `.meta` so the layout guard reads as clean.
  if (!input.dryRun && (await pathExists(metaRoot)) && (await listDirNames(metaRoot)).length === 0) {
    await rm(metaRoot, { recursive: true, force: true });
  }
}

async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
