#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { Config, type Config as ConfigEnum } from "@bb/types";
import { getBytebellHome, getConfigValue, HINTS } from "@bb/config";
import { connectMongo } from "@bb/mongo";
import { connectRedis } from "@bb/redis";
import { connectNeo4j, ensureKnowledgeIndexes } from "@bb/neo4j";
import { connectQueue } from "@bb/queue";
import { registerGithubWorkers, registerLocalIngestWorker } from "@bb/ingest-github";
import { ServerConfigError } from "@bb/errors";
import { registerRoutes } from "./routes.ts";
import { installShutdownHandlers } from "./shutdown.ts";

const REQUIRED: ConfigEnum[] = [
  Config.MongoUri,
  Config.RedisUrl,
  Config.Neo4jUri,
  Config.Neo4jUser,
  Config.Neo4jPassword,
  Config.OpenrouterApiKey,
];

function checkRequiredConfig(): void {
  const missing: string[] = [];
  const hints: string[] = [];
  for (const key of REQUIRED) {
    const value = getConfigValue(key);
    if (typeof value === "string" && value.length === 0) {
      missing.push(key);
      hints.push(HINTS[key]);
    }
  }
  if (missing.length > 0) {
    throw new ServerConfigError(missing, hints);
  }
}

async function main(): Promise<void> {
  checkRequiredConfig();
  await connectMongo();
  await connectRedis();
  await connectNeo4j();
  await ensureKnowledgeIndexes();
  await connectQueue();
  registerGithubWorkers();
  registerLocalIngestWorker();
  installShutdownHandlers();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerRoutes(app);

  const port = getConfigValue(Config.ServerPort);
  app.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Bytebell server listening on http://127.0.0.1:${port}\n`);
  });

  await writeFile(path.join(getBytebellHome(), "pid"), String(process.pid), { mode: 0o644 });
}

main().catch((cause: unknown) => {
  if (cause instanceof ServerConfigError) {
    process.stderr.write(`${cause.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exit(1);
});
