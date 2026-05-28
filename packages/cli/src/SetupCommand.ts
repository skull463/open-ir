// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { Config } from "@bb/types";
import { getBytebellHome, getConfigValue } from "@bb/config";
import { InstallWizard, type InstallWizardResult } from "./InstallWizard.tsx";
import { KEY_MAP } from "./keyMap.ts";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { postJson, HttpClientError } from "./httpClient.ts";
import { success, error, info, createSpinner } from "./output.ts";
import { pollIndexToCompletion, type IndexResponse } from "./indexPoller.ts";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export function buildSetupCommand(): Command {
  const cmd = new Command("setup");
  cmd.description("Interactive first-run wizard: configure LLM provider, then boot.").action(runSetup);
  return cmd;
}

async function runSetup(): Promise<void> {
  if (process.stdin.isTTY !== true) {
    error("bytebell setup requires an interactive terminal. Run it directly, not piped.");
    process.exitCode = 1;
    return;
  }
  const result = await runWizard();
  if (result === null) {
    info("Setup cancelled.");
    return;
  }
  applyConfig(result);
  const booted = await boot();
  if (!booted) {
    return;
  }
  if (result.indexUrl !== undefined) {
    await startIndex(result.indexUrl);
  } else {
    const port = getConfigValue(Config.ServerPort);
    success(`Connect Claude Code:\n  claude mcp add --transport http bytebell http://127.0.0.1:${port}/mcp`);
  }
}

function runWizard(): Promise<InstallWizardResult | null> {
  return new Promise<InstallWizardResult | null>((resolve) => {
    let resolved = false;
    const app = render(
      React.createElement(InstallWizard, {
        onDone: (res) => {
          if (!resolved) {
            resolved = true;
            app.unmount();
            resolve(res);
          }
        },
      }),
    );
    app
      .waitUntilExit()
      .then(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      })
      .catch(() => undefined);
  });
}

function applyConfig(result: InstallWizardResult): void {
  const providerEntry = KEY_MAP["llm-provider"];
  if (providerEntry === undefined) {
    throw new Error("internal: KEY_MAP missing 'llm-provider'");
  }
  providerEntry.setter(result.provider);

  if (result.provider === "openrouter") {
    const keyEntry = KEY_MAP["openrouter-api-key"];
    const modelEntry = KEY_MAP["openrouter-model"];
    if (keyEntry === undefined) {
      throw new Error("internal: KEY_MAP missing 'openrouter-api-key'");
    }
    if (modelEntry === undefined) {
      throw new Error("internal: KEY_MAP missing 'openrouter-model'");
    }
    if (result.openrouterApiKey !== undefined) {
      keyEntry.setter(result.openrouterApiKey);
    }
    if (result.openrouterModel !== undefined) {
      modelEntry.setter(result.openrouterModel);
    }
    success(`OpenRouter configured (model: ${result.openrouterModel ?? "(not set)"})`);
  } else {
    const urlEntry = KEY_MAP["ollama-url"];
    const modelEntry = KEY_MAP["ollama-model"];
    if (urlEntry === undefined) {
      throw new Error("internal: KEY_MAP missing 'ollama-url'");
    }
    if (modelEntry === undefined) {
      throw new Error("internal: KEY_MAP missing 'ollama-model'");
    }
    if (result.ollamaUrl !== undefined) {
      urlEntry.setter(result.ollamaUrl);
    }
    if (result.ollamaModel !== undefined) {
      modelEntry.setter(result.ollamaModel);
    }
    success(`Ollama configured (model: ${result.ollamaModel ?? "(not set)"})`);
  }
}

async function stopRunningServer(): Promise<void> {
  const pidFile = path.join(getBytebellHome(), "pid");
  let pid: number | null = null;
  try {
    const raw = await readFile(pidFile, "utf8");
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) {
      pid = n;
    }
  } catch {
    return;
  }
  if (pid === null) {
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  for (let i = 0; i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await stat(pidFile);
    } catch {
      return;
    }
  }
}

async function boot(): Promise<boolean> {
  const spinner = createSpinner("Starting ByteBell server...");
  try {
    spinner.update("Stopping any running server...");
    await stopRunningServer();
    const ctx = await ensureServerRunning((line) => spinner.update(`Server: ${line}`));
    spinner.stop(true, `Server started (logs: ${ctx.logPath ?? "n/a"})`);
    const port = getConfigValue(Config.ServerPort);
    success(`MCP endpoint: http://127.0.0.1:${port}/mcp`);
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

async function startIndex(repoUrl: string): Promise<void> {
  let res: IndexResponse;
  try {
    res = await postJson<IndexResponse>("/api/v1/github/index", { repoUrl });
  } catch (cause: unknown) {
    if (cause instanceof HttpClientError) {
      error(`Failed to start indexing: ${cause.message}`);
    } else {
      error(`Failed to start indexing: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return;
  }

  await pollIndexToCompletion(res.knowledgeId, res.jobId);

  const port = getConfigValue(Config.ServerPort);
  success(`Connect Claude Code:\n  claude mcp add --transport http bytebell http://127.0.0.1:${port}/mcp`);
}
