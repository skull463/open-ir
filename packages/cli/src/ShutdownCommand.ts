// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { Command } from "commander";
import { readFile, stat, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { getBytebellHome, getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { DockerComposeError, DockerNotFoundError, composeFilePath, down } from "./dockerInfra.ts";
import { createSpinner, error, success } from "./output.ts";
import { promptStopDocker } from "./shutdownPrompts.ts";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

interface ShutdownOptions {
  withDocker?: boolean;
  keepDocker?: boolean;
}

export function buildShutdownCommand(): Command {
  const cmd = new Command("shutdown");
  cmd
    .description("Stop the bytebell-server (and optionally Docker infra).")
    .option("--with-docker", "also stop Docker infra without prompting")
    .option("--keep-docker", "leave Docker infra running without prompting")
    .action((opts: ShutdownOptions) => runShutdown(opts));
  return cmd;
}

async function runShutdown(opts: ShutdownOptions): Promise<void> {
  if (opts.withDocker === true && opts.keepDocker === true) {
    error("--with-docker and --keep-docker are mutually exclusive.");
    process.exitCode = 1;
    return;
  }

  const pidFile = path.join(getBytebellHome(), "pid");
  const port = getConfigValue(Config.ServerPort);
  // The pid file can be stale — a double-start where the loser died on the
  // port-bind conflict without unlinking it. So we trust the live process
  // that actually holds the server port, and consult the pid file only to
  // catch a server bound to a different interface.
  const targets = await resolveTargets(pidFile, port);

  if (targets.length === 0) {
    success("server is not running.");
    await removeStalePidFile(pidFile);
    process.stdout.write(dockerHint());
    return;
  }

  const spinner = createSpinner("Shutting down ByteBell server...");
  let signalled = false;
  for (const pid of targets) {
    try {
      process.kill(pid, "SIGTERM");
      signalled = true;
    } catch (cause: unknown) {
      if ((cause as { code?: string } | undefined)?.code !== "ESRCH") {
        spinner.stop(false, `Failed to send SIGTERM to pid ${pid}`);
        error(cause instanceof Error ? cause.message : String(cause));
        process.exitCode = 1;
        return;
      }
    }
  }
  if (!signalled) {
    spinner.stop(true, "server pid file was stale; nothing to stop.");
    await removeStalePidFile(pidFile);
    process.stdout.write(dockerHint());
    return;
  }

  const drained = await waitForServerStopped(port);
  if (!drained) {
    spinner.stop(
      false,
      `server (pid ${targets.join(", ")}) did not exit within ${POLL_TIMEOUT_MS / 1000}s; not escalating to SIGKILL.`,
    );
    process.exitCode = 1;
    process.stdout.write(dockerHint());
    return;
  }
  await removeStalePidFile(pidFile);
  spinner.stop(true, `server (pid ${targets.join(", ")}) shut down gracefully.`);

  const shouldStop = await decideStopDocker(opts);
  if (shouldStop) {
    await stopDocker();
  } else {
    process.stdout.write(dockerHint());
  }
}

/** The pids worth signalling: the port's live listener(s) plus a live pid
 * from the pid file (deduped, never this CLI process). */
async function resolveTargets(pidFile: string, port: number): Promise<number[]> {
  const targets = new Set<number>();
  const filePid = await readPid(pidFile);
  if (filePid !== null && isAlive(filePid)) {
    targets.add(filePid);
  }
  for (const pid of await findListenerPids(port)) {
    if (pid !== process.pid) {
      targets.add(pid);
    }
  }
  return [...targets];
}

/** `kill(pid, 0)` probes liveness: ESRCH → dead, EPERM → alive but not ours
 * to signal (still counts as running). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause: unknown) {
    return (cause as { code?: string } | undefined)?.code === "EPERM";
  }
}

/** Pids holding a LISTEN socket on the given TCP port, via `lsof`. Returns
 * `[]` when lsof is absent or finds nothing — callers degrade gracefully. */
function findListenerPids(port: number): Promise<number[]> {
  return new Promise((resolve) => {
    execFile("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], (cause, stdout) => {
      if (cause !== null || stdout.length === 0) {
        resolve([]);
        return;
      }
      const pids = stdout
        .split(/\s+/u)
        .map((s) => Number.parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      resolve([...new Set(pids)]);
    });
  });
}

async function decideStopDocker(opts: ShutdownOptions): Promise<boolean> {
  if (opts.withDocker === true) {
    return true;
  }
  if (opts.keepDocker === true) {
    return false;
  }
  if (process.stdin.isTTY !== true) {
    return false;
  }
  return promptStopDocker();
}

async function stopDocker(): Promise<void> {
  const spinner = createSpinner("Stopping Docker infrastructure...");
  try {
    await down();
    spinner.stop(true, "Docker infra stopped.");
  } catch (cause: unknown) {
    spinner.stop(false, "Docker shutdown failed");
    if (cause instanceof DockerNotFoundError) {
      error(cause.message);
    } else if (cause instanceof DockerComposeError) {
      error(cause.message);
    } else {
      error(cause instanceof Error ? cause.message : String(cause));
    }
    process.exitCode = 1;
    process.stdout.write(dockerHint());
  }
}

async function readPid(pidFile: string): Promise<number | null> {
  try {
    const raw = await readFile(pidFile, "utf8");
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Stops when no process still holds the server port. */
async function waitForServerStopped(port: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    if ((await findListenerPids(port)).length === 0) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return (await findListenerPids(port)).length === 0;
}

async function removeStalePidFile(pidFile: string): Promise<void> {
  if (await pidFileExists(pidFile)) {
    await unlink(pidFile).catch(() => undefined);
  }
}

async function pidFileExists(pidFile: string): Promise<boolean> {
  try {
    await stat(pidFile);
    return true;
  } catch {
    return false;
  }
}

function dockerHint(): string {
  return `\nDocker infra is still running. To stop it:\n  docker compose -f ${composeFilePath()} down\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
