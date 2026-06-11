import { passesPathFilters } from "#src/pipeline/filters.ts";
import { matchesAnyGlob } from "#src/pipeline/skip-decisions/seed.ts";
import type { EffectiveIgnoreSets } from "#src/pipeline/skip-decisions/effective.ts";
import type { BigFileEntry } from "#src/types/big-file.ts";

/**
 * Replicates the index-time static skip decision for a single diff path. With
 * `sets` undefined, falls back to the built-in filename/extension filter only
 * (legacy pull behavior). With `sets` present, also rejects paths under an
 * ignored directory segment or matching an ignored glob — so a pull honours the
 * org's overrides the same way the initial index does.
 */
export function isStaticallyIgnored(
  relativePath: string,
  filename: string,
  ext: string,
  sets: EffectiveIgnoreSets | undefined,
): boolean {
  if (!passesPathFilters(filename, ext, sets)) {
    return true;
  }
  if (sets === undefined) {
    return false;
  }
  for (const segment of relativePath.split("/").slice(0, -1)) {
    if (sets.directories.has(segment)) {
      return true;
    }
  }
  return matchesAnyGlob(filename, sets.globs);
}

/** Merge big-file entries by path, later additions winning. */
export function mergeBigFileEntries(existing: BigFileEntry[], additions: BigFileEntry[]): BigFileEntry[] {
  const byPath = new Map<string, BigFileEntry>();
  for (const entry of existing) {
    byPath.set(entry.relativePath, entry);
  }
  for (const entry of additions) {
    byPath.set(entry.relativePath, entry);
  }
  return [...byPath.values()];
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
