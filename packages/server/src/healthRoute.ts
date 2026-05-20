import type { Request, Response, Router } from "express";
import express from "express";
import { pingDb } from "@bb/db";
import { pingRedis } from "@bb/redis";
import { pingGraph } from "@bb/graph-db";

export function buildHealthRoute(): Router {
  const router = express.Router();
  router.get("/health", async (_req: Request, res: Response) => {
    const [mongo, redis, neo4j] = await Promise.all([pingDb(), pingRedis(), pingGraph()]);
    const ok = mongo.ok && redis.ok && neo4j.ok;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "down", mongo, redis, neo4j });
  });
  return router;
}
