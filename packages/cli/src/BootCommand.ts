// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { Command } from "commander";
import { Config } from "@bb/types";
import { HINTS, getConfigValue, isDevMode } from "@bb/config";
import { applyInfraDefaults, checkPreflight } from "./bootConfig.ts";
import { bringInfraUp } from "./dockerBoot.ts";
import { startServer } from "./serverLifecycle.ts";
import { error, info, success } from "./output.ts";

export function buildBootCommand(): Command {
  const cmd = new Command("boot");
  cmd.description("Bring up Docker infra (mongo + neo4j + redis) and start the bytebell-server.").action(runBoot);
  return cmd;
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

  if (defaults.neo4jPassword.length === 0) {
    error("internal: neo4j password is empty after applyInfraDefaults — refusing to start docker.");
    process.exitCode = 1;
    return;
  }

  const upResult = await bringInfraUp(defaults.neo4jPassword);
  if (upResult === null) {
    return;
  }
  success(`mongo  → ${upResult.services.mongo}`);
  success(`neo4j  → ${upResult.services.neo4j}`);
  success(`redis  → ${upResult.services.redis}`);

  if (!(await startServer())) {
    return;
  }

  const port = getConfigValue(Config.ServerPort);
  success(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
  process.stdout.write("\nNext: bytebell index <git-url>  or  bytebell ingest [path]\n");
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
