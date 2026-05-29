import { mkdir, open, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "@bb/types";
import { getConfigValue, isDevMode } from "@bb/config";
import { getLogsDir } from "@bb/logger";

const HEALTH_TIMEOUT_MS = 500;
const SPAWN_POLL_INTERVAL_MS = 200;
const SPAWN_MAX_POLLS = 50;

export class ServerStartTimeoutError extends Error {
  override readonly name = "ServerStartTimeoutError";
  readonly logPath: string;

  constructor(logPath: string) {
    super(`server didn't come up within ${(SPAWN_POLL_INTERVAL_MS * SPAWN_MAX_POLLS) / 1000}s. Check ${logPath}`);
    this.logPath = logPath;
  }
}

export class ServerInfraDownError extends Error {
  override readonly name = "ServerInfraDownError";
  readonly services: string[];

  constructor(services: string[]) {
    super(`server started but infra not reachable: ${services.join(", ")}. Make sure Docker is running.`);
    this.services = services;
  }
}

export class ServerInfraUnreachableError extends Error {
  override readonly name = "ServerInfraUnreachableError";
  readonly services: { name: string; uri: string }[];

  constructor(services: { name: string; uri: string }[]) {
    const list = services.map((s) => `${s.name} (${s.uri})`).join(", ");
    super(`infra not reachable before server start: ${list}. Is Docker running?`);
    this.services = services;
  }
}

export class ServerProcessExitedError extends Error {
  override readonly name = "ServerProcessExitedError";
  readonly logTail: string;

  constructor(code: number | null, logTail: string) {
    super(`server process exited immediately (code ${code ?? "null"})`);
    this.logTail = logTail;
  }
}

async function tcpReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.setTimeout(1000, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function parseHostPort(uri: string): { host: string; port: number } | null {
  try {
    const u = new URL(uri);
    const defaultPort = u.protocol === "bolt:" ? 7687 : u.protocol === "redis:" ? 6379 : 27017;
    const port = u.port !== "" ? Number.parseInt(u.port, 10) : defaultPort;
    return { host: u.hostname || "127.0.0.1", port };
  } catch {
    return null;
  }
}

async function checkInfraReachable(): Promise<void> {
  const checks = [
    { name: "mongo", uri: getConfigValue(Config.MongoUri) },
    { name: "redis", uri: getConfigValue(Config.RedisUrl) },
    { name: "neo4j", uri: getConfigValue(Config.Neo4jUri) },
  ];
  const down: { name: string; uri: string }[] = [];
  for (const check of checks) {
    if (check.uri.length === 0) {
      continue;
    }
    const parsed = parseHostPort(check.uri);
    if (parsed === null) {
      continue;
    }
    const ok = await tcpReachable(parsed.host, parsed.port);
    if (!ok) {
      down.push({ name: check.name, uri: `${parsed.host}:${parsed.port}` });
    }
  }
  if (down.length > 0) {
    throw new ServerInfraUnreachableError(down);
  }
}

export async function ensureServerRunning(onProgress?: (line: string) => void): Promise<{
  alreadyRunning: boolean;
  logPath?: string;
  devModeMismatch?: boolean;
}> {
  if (await isHealthy()) {
    // The running server was spawned in whatever env existed at boot. We
    // can't introspect its environment from here, but if the CURRENT process
    // has BYTEBELL_DEV=1 set we surface a mismatch hint — without it, users
    // assume the running server picked up the toggle when it hasn't.
    return { alreadyRunning: true, devModeMismatch: isDevMode() };
  }
  await checkInfraReachable();
  const logPath = await spawnDetached();
  for (let i = 0; i < SPAWN_MAX_POLLS; i++) {
    if (onProgress !== undefined) {
      onProgress(`waiting for server health check (${i + 1}/${SPAWN_MAX_POLLS})`);
    }
    await sleep(SPAWN_POLL_INTERVAL_MS);
    if (await isHealthy()) {
      return { alreadyRunning: false, logPath };
    }
  }
  throw new ServerStartTimeoutError(logPath);
}

type HealthBody = { mongo?: { ok: boolean }; redis?: { ok: boolean }; neo4j?: { ok: boolean } };

async function isHealthy(): Promise<boolean> {
  const port = getConfigValue(Config.ServerPort);
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (res.ok) {
    return true;
  }
  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as HealthBody;
    const down: string[] = [];
    if (body.mongo?.ok === false) {
      down.push("mongo");
    }
    if (body.redis?.ok === false) {
      down.push("redis");
    }
    if (body.neo4j?.ok === false) {
      down.push("neo4j");
    }
    if (down.length > 0) {
      throw new ServerInfraDownError(down);
    }
  }
  return false;
}

const EARLY_EXIT_WATCH_MS = 1500;
const LOG_TAIL_LINES = 20;

async function spawnDetached(): Promise<string> {
  const logsDir = getLogsDir();
  await mkdir(logsDir, { recursive: true, mode: 0o700 });
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(logsDir, `server-${today}.log`);
  const fh = await open(logPath, "a");
  const entry = resolveServerEntry();
  const child = spawn("bun", ["--bun", entry], {
    stdio: ["ignore", fh.fd, fh.fd],
    detached: true,
  });
  await fh.close();

  // Watch briefly for an immediate exit (e.g. boot guard, config error).
  const exitCode = await Promise.race([
    new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code))),
    sleep(EARLY_EXIT_WATCH_MS).then(() => undefined),
  ]);

  if (exitCode !== undefined) {
    // Process already exited — read the log tail and throw.
    const logTail = await readLogTail(logPath);
    throw new ServerProcessExitedError(exitCode, logTail);
  }

  child.unref();
  return logPath;
}

async function readLogTail(logPath: string): Promise<string> {
  try {
    const content = await readFile(logPath, "utf8");
    const lines = content.trimEnd().split("\n");
    return lines.slice(-LOG_TAIL_LINES).join("\n");
  } catch {
    return "";
  }
}

function resolveServerEntry(): string {
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), "..", "..", "server", "src", "index.ts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
