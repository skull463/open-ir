import fs from "node:fs/promises";
import path from "node:path";
import { getLogsDir } from "@bb/logger";

export interface LogTailer {
  stop(): Promise<void>;
}

const POLL_INTERVAL_MS = 250;

/**
 * Start tailing the daily-rotated server log file (`server-YYYY-MM-DD.log`)
 * and stream new bytes to `process.stdout` as they land.
 *
 * Caller MUST `await tailer.stop()` before exiting so the final tail of the
 * log makes it to the terminal — otherwise the last few writes from the
 * server process can lose the race against the CLI exit.
 */
export async function startLogTailer(scope: "server" | "cli" = "server"): Promise<LogTailer> {
  const logsDir = getLogsDir();
  let currentPath = await resolveLogPath(logsDir, scope);
  let offset = await fileSize(currentPath);
  let stopped = false;

  const tick = async (): Promise<void> => {
    const nextPath = await resolveLogPath(logsDir, scope);
    if (nextPath !== currentPath) {
      // daily rotation crossed midnight; flush the new file from byte 0
      currentPath = nextPath;
      offset = 0;
    }
    const size = await fileSize(currentPath);
    if (size < offset) {
      // log file truncated or rotated in place; reset offset
      offset = 0;
    }
    if (size > offset) {
      try {
        const handle = await fs.open(currentPath, "r");
        try {
          const length = size - offset;
          const buf = Buffer.alloc(length);
          await handle.read(buf, 0, length, offset);
          process.stdout.write(buf.toString("utf8"));
          offset = size;
        } finally {
          await handle.close();
        }
      } catch {
        // file disappeared mid-read; recover on next tick
      }
    }
  };

  const interval = setInterval(() => {
    if (stopped) {
      return;
    }
    void tick();
  }, POLL_INTERVAL_MS);

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(interval);
      await tick();
    },
  };
}

async function resolveLogPath(logsDir: string, scope: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `${scope}-${today}.log`);
}

async function fileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}
