// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { InstallWizard, type InstallWizardResult } from "./InstallWizard.tsx";
import { KEY_MAP } from "./keyMap.ts";
import { ensureServerRunning, ServerStartTimeoutError } from "./serverSpawn.ts";
import { getJson, postJson, HttpClientError } from "./httpClient.ts";
import { success, error, info, createSpinner, createProgressBar, type ProgressBar } from "./output.ts";
import { getBytebellHome } from "@bb/config";
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
    await kickIndex(result.indexUrl);
  } else {
    success("Connect Claude Code:\n  claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp");
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
    const ctx = await ensureServerRunning((line) => spinner.update(`Server: ${line}`));
    if (ctx.alreadyRunning) {
      // Server was already running with old config — restart it so the new
      // LLM provider/model written by applyConfig is picked up from disk.
      spinner.update("Restarting server to apply new config...");
      await stopRunningServer();
    }
    const fresh = await ensureServerRunning((line) => spinner.update(`Server: ${line}`));
    spinner.stop(true, `Server started (logs: ${fresh.logPath ?? "n/a"})`);
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

interface IndexResponse {
  knowledgeId: string;
  jobId: string;
}

interface RepoStatus {
  state: string;
  fileCount: number;
  totalFiles?: number;
  processedFiles?: number;
  failure?: { reason: string; category: string; detail?: string } | null;
}

async function kickIndex(repoUrl: string): Promise<void> {
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

  const { knowledgeId } = res;
  const spinner = createSpinner(`Indexing ${repoUrl}...`);
  let bar: ProgressBar | null = null;

  while (true) {
    try {
      const status = await getJson<RepoStatus>(`/api/v1/repos/${knowledgeId}`);

      if (status.totalFiles !== undefined && status.totalFiles > 0) {
        if (bar === null) {
          spinner.stop(true, `Ingesting ${knowledgeId}`);
          bar = createProgressBar(`Ingesting ${knowledgeId}`);
        }
        bar.update(status.processedFiles ?? 0, status.totalFiles, `Ingesting ${knowledgeId}`);
      } else {
        spinner.update(`Indexing: ${status.state}${status.fileCount > 0 ? ` (${status.fileCount} files)` : ""}`);
      }

      if (status.state === "PROCESSED") {
        const msg = `Successfully indexed ${knowledgeId} (${status.fileCount} files)`;
        if (bar !== null) {
          bar.stop(true, msg);
        } else {
          spinner.stop(true, msg);
        }
        success(`Connect Claude Code:\n  claude mcp add --transport http bytebell http://127.0.0.1:8080/mcp`);
        return;
      }
      if (status.state === "FAILED") {
        const failMsg = status.failure?.reason ?? "unknown error";
        if (bar !== null) {
          bar.stop(false, `Indexing failed: ${failMsg}`);
        } else {
          spinner.stop(false, `Indexing failed: ${failMsg}`);
        }
        if (status.failure) {
          error(`category: ${status.failure.category}`);
          if (status.failure.detail) {
            error(`detail:   ${status.failure.detail}`);
          }
        }
        return;
      }
    } catch (cause: unknown) {
      const msg = `Failed to poll status: ${cause instanceof Error ? cause.message : String(cause)}`;
      if (bar !== null) {
        bar.stop(false, msg);
      } else {
        spinner.stop(false, msg);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
