// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { randomBytes } from "node:crypto";
import { Config, QueueProviderType } from "@bb/types";
import { getConfigValue, requiredKeysFor } from "@bb/config";
import { bringInfraUp } from "./dockerBoot.ts";
import { KEY_MAP } from "./keyMap.ts";
import { success, error } from "./output.ts";
import { startServer } from "./serverLifecycle.ts";

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/bytebell";
const DEFAULT_NEO4J_URI = "bolt://127.0.0.1:7687";
const DEFAULT_NEO4J_USER = "neo4j";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

interface DefaultEntry {
  cliKey: string;
  configKey: Config;
  computeDefault: () => string;
}

const DEFAULTS: readonly DefaultEntry[] = [
  { cliKey: "mongo", configKey: Config.MongoUri, computeDefault: () => DEFAULT_MONGO_URI },
  { cliKey: "neo4j", configKey: Config.Neo4jUri, computeDefault: () => DEFAULT_NEO4J_URI },
  { cliKey: "neo4j-user", configKey: Config.Neo4jUser, computeDefault: () => DEFAULT_NEO4J_USER },
  { cliKey: "redis", configKey: Config.RedisUrl, computeDefault: () => DEFAULT_REDIS_URL },
  { cliKey: "neo4j-password", configKey: Config.Neo4jPassword, computeDefault: generateNeo4jPassword },
];

export interface ApplyDefaultsResult {
  written: { cliKey: string; redacted: boolean }[];
  neo4jPassword: string;
}

export function applyInfraDefaults(): ApplyDefaultsResult {
  const written: { cliKey: string; redacted: boolean }[] = [];
  const usingHonker = readString(Config.QueueProvider) === QueueProviderType.Honker;
  for (const entry of DEFAULTS) {
    if (entry.configKey === Config.RedisUrl && usingHonker) {
      continue;
    }
    const current = readString(entry.configKey);
    if (current.length > 0) {
      continue;
    }
    const value = entry.computeDefault();
    const setter = KEY_MAP[entry.cliKey];
    if (setter === undefined) {
      throw new Error(`internal: KEY_MAP entry "${entry.cliKey}" missing`);
    }
    setter.setter(value);
    written.push({ cliKey: entry.cliKey, redacted: setter.redact });
  }
  return {
    written,
    neo4jPassword: readString(Config.Neo4jPassword),
  };
}

export interface PreflightResult {
  ok: boolean;
  missing: { configKey: Config; hintKey: string }[];
}

const CONFIG_HINT_KEYS: Partial<Record<Config, string>> = {
  [Config.OpenrouterApiKey]: "openrouter-api-key",
  [Config.OpenrouterModel]: "openrouter-model",
  [Config.OllamaUrl]: "ollama-url",
  [Config.OllamaModel]: "ollama-model",
};

export function checkPreflight(): PreflightResult {
  const provider = getConfigValue(Config.LlmProvider);
  const required = requiredKeysFor(provider);
  const missing: PreflightResult["missing"] = [];
  for (const configKey of required) {
    const value = getConfigValue(configKey);
    const isEmpty = typeof value === "string" ? value.length === 0 : false;
    if (isEmpty) {
      const hintKey = CONFIG_HINT_KEYS[configKey] ?? String(configKey);
      missing.push({ configKey, hintKey });
    }
  }
  return { ok: missing.length === 0, missing };
}

export async function runBootSequence(): Promise<boolean> {
  const defaults = applyInfraDefaults();
  for (const entry of defaults.written) {
    if (entry.redacted) {
      success(`set ${entry.cliKey}=<redacted> (auto-generated)`);
    } else {
      success(`set ${entry.cliKey} (auto-filled with local-docker default)`);
    }
  }

  if (defaults.neo4jPassword.length === 0) {
    error("internal: neo4j password is empty after applyInfraDefaults — refusing to start docker.");
    process.exitCode = 1;
    return false;
  }

  const upResult = await bringInfraUp(defaults.neo4jPassword);
  if (upResult === null) {
    return false;
  }
  success(`mongo  → ${upResult.services.mongo}`);
  success(`neo4j  → ${upResult.services.neo4j}`);
  success(`redis  → ${upResult.services.redis}`);

  const started = await startServer();
  if (!started) {
    return false;
  }

  const port = getConfigValue(Config.ServerPort);
  success(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
  return true;
}

function readString(key: Config): string {
  const value = getConfigValue(key);
  return typeof value === "string" ? value : "";
}

function generateNeo4jPassword(): string {
  return randomBytes(24).toString("base64url");
}
