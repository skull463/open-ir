import type { Request, Response, Router } from "express";
import express from "express";
import { pingMongo } from "@bb/mongo";
import { pingRedis } from "@bb/redis";
import { pingNeo4j } from "@bb/neo4j";

export function buildHealthRoute(): Router {
  const router = express.Router();
  router.get("/health", async (_req: Request, res: Response) => {
    const [mongo, redis, neo4j] = await Promise.all([pingMongo(), pingRedis(), pingNeo4j()]);
    const ok = mongo.ok && redis.ok && neo4j.ok;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "down", mongo, redis, neo4j });
  });
  return router;
}
