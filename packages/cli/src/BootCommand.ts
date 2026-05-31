// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import path from "node:path";
import { homedir } from "node:os";
import { Command } from "commander";
import { Config, DbProviderType, GraphProviderType } from "@bb/types";
import { HINTS, getBytebellHome, getConfigValue, isDevMode } from "@bb/config";
import { applyInfraDefaults, checkPreflight } from "./bootConfig.ts";
import { ServerStartTimeoutError, ensureServerRunning } from "./serverSpawn.ts";
import { createSpinner, error, info, success } from "./output.ts";
import { bringInfraUp, usingHonker } from "./bootInfra.ts";

export function buildBootCommand(): Command {
  const cmd = new Command("boot");
  cmd
    .description(
      "Bring up Docker infra (mongo + neo4j + redis/honker per queue-provider) and start the bytebell-server.",
    )
    .action(runBoot);
  return cmd;
}

function expandTilde(p: string): string {
  if (p === "~") {
    return homedir();
  }
  if (p.startsWith("~/")) {
    return path.join(homedir(), p.slice(2));
  }
  return p;
}

async function runBoot(): Promise<void> {
  if (!enforcePreflight()) {
    process.exitCode = 1;
    return;
  }

  if (isDevMode()) {
    info(`dev mode: logs → ${process.cwd()}/logs/`);
  }

  const defaults = applyInfraDefaults();
  for (const entry of defaults.written) {
    if (entry.redacted) {
      success(`set ${entry.cliKey}=<redacted> (auto-generated)`);
    } else {
      success(`set ${entry.cliKey} (auto-filled with local-docker default)`);
    }
  }

  const dbProvider = getConfigValue(Config.DbProvider);
  const graphProvider = getConfigValue(Config.GraphProvider);

  if (graphProvider === GraphProviderType.Neo4j && defaults.neo4jPassword.length === 0) {
    error("internal: neo4j password is empty after applyInfraDefaults — refusing to start docker.");
    process.exitCode = 1;
    return;
  }

  const upResult = await bringInfraUp(defaults.neo4jPassword);
  if (upResult === null) {
    return;
  }

  if (usingHonker()) {
    const queueDbPath = getConfigValue(Config.QueueDbPath);
    const resolved = queueDbPath.length > 0 ? expandTilde(queueDbPath) : path.join(getBytebellHome(), "queue.db");
    success(`queue  → honker (sqlite: ${resolved})`);
  } else {
    success(`redis  → ${upResult.services.redis}`);
  }
  if (dbProvider === DbProviderType.Mongo) {
    success(`mongo  → ${upResult.services.mongo}`);
  }
  if (graphProvider === GraphProviderType.Neo4j) {
    success(`neo4j  → ${upResult.services.neo4j}`);
  }
  success(`redis  → ${upResult.services.redis}`);

  if (!(await startServer())) {
    return;
  }

  const port = getConfigValue(Config.ServerPort);
  success(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
  process.stdout.write("\nNext: bytebell index <git-url>  or  bytebell ingest [path]\n");
}

async function startServer(): Promise<boolean> {
  const spinner = createSpinner("Starting ByteBell server...");
  try {
    const ctx = await ensureServerRunning((line) => spinner.update(`Server: ${line}`));
    if (ctx.alreadyRunning) {
      spinner.stop(true, "Server already running");
      if (ctx.devModeMismatch === true) {
        info(
          "BYTEBELL_DEV=1 set but server is already running. Run `bytebell shutdown && BYTEBELL_DEV=1 bytebell boot` to apply.",
        );
      }
    } else {
      spinner.stop(true, `Server started (logs: ${ctx.logPath ?? "n/a"})`);
    }
    return true;
  } catch (cause: unknown) {
    spinner.stop(false, "Server startup failed");
    if (cause instanceof ServerStartTimeoutError) {
      error(cause.message);
    } else {
      error(cause instanceof Error ? cause.message : String(cause));
    }
    process.exitCode = 1;
    return false;
  }
}

function enforcePreflight(): boolean {
  const result = checkPreflight();
  if (result.ok) {
    return true;
  }
  for (const entry of result.missing) {
    error(`${entry.hintKey} is not set`, HINTS[entry.configKey]);
  }
  return false;
}
