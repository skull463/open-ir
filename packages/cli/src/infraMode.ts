// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import path from "node:path";
import { Config, DbProviderType, GraphProviderType, QueueProviderType } from "@bb/types";
import { getBytebellHome, getConfigValue, setConfigValue } from "@bb/config";

/**
 * Infrastructure mode is not a stored flag — it's derived from the three
 * provider settings. There are two coherent presets:
 *
 *   • "docker"   (non-embedded) — Mongo + Neo4j + BullMQ. Requires Docker.
 *   • "embedded"                — SQLite + Ladybug + Honker. Zero Docker.
 *
 * The providers remain the single source of truth; `mode` is a convenience the
 * setup surfaces use to set all three at once and to decide whether `boot`
 * should bring Docker up.
 */
export type InfraMode = "docker" | "embedded";

interface ProviderTriple {
  db: DbProviderType;
  graph: GraphProviderType;
  queue: QueueProviderType;
}

export const DOCKER_PROVIDERS: ProviderTriple = {
  db: DbProviderType.Mongo,
  graph: GraphProviderType.Neo4j,
  queue: QueueProviderType.Bullmq,
};

export const EMBEDDED_PROVIDERS: ProviderTriple = {
  db: DbProviderType.Sqlite,
  graph: GraphProviderType.Ladybug,
  queue: QueueProviderType.Honker,
};

export type ComposeService = "mongo" | "neo4j" | "redis";

/**
 * The Docker compose services the current provider combo requires. Empty when
 * every provider is file-based (embedded mode).
 */
export function composeServicesNeeded(): Set<ComposeService> {
  const needed = new Set<ComposeService>();
  if (getConfigValue(Config.DbProvider) === DbProviderType.Mongo) {
    needed.add("mongo");
  }
  if (getConfigValue(Config.GraphProvider) === GraphProviderType.Neo4j) {
    needed.add("neo4j");
  }
  if (getConfigValue(Config.QueueProvider) === QueueProviderType.Bullmq) {
    needed.add("redis");
  }
  return needed;
}

/** True when at least one provider needs a Docker container. */
export function needsDocker(): boolean {
  return composeServicesNeeded().size > 0;
}

/** True when the active provider combo is fully file-based (no Docker). */
export function isEmbedded(): boolean {
  return !needsDocker();
}

/**
 * Embedded-mode store paths, derived from the bytebell home so the user never
 * has to set them by hand. Filled on entering embedded mode; an existing
 * non-empty value (an explicit override) is left untouched.
 */
const EMBEDDED_PATH_DEFAULTS: ReadonlyArray<readonly [Config, string]> = [
  [Config.SqlitePath, "data.sqlite"],
  [Config.LadybugPath, "ladybug.lbug"],
  [Config.QueueDbPath, "queue.db"],
];

/** Apply one of the two presets to the three provider config keys. */
export function applyInfraMode(mode: InfraMode): void {
  const triple = mode === "embedded" ? EMBEDDED_PROVIDERS : DOCKER_PROVIDERS;
  setConfigValue(Config.DbProvider, triple.db);
  setConfigValue(Config.GraphProvider, triple.graph);
  setConfigValue(Config.QueueProvider, triple.queue);
  if (mode !== "embedded") {
    return;
  }
  const home = getBytebellHome();
  for (const [key, filename] of EMBEDDED_PATH_DEFAULTS) {
    const current = getConfigValue(key);
    if (typeof current === "string" && current.length === 0) {
      setConfigValue(key, path.join(home, filename));
    }
  }
}
