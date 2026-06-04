import type { Request, Response, Router } from "express";
import express from "express";
import { pingDb } from "@bb/db";
import { pingGraph } from "@bb/graph-db";
import { pingQueue } from "@bb/queue";

export function buildHealthRoute(): Router {
  const router = express.Router();
  router.get("/health", async (_req: Request, res: Response) => {
    const [db, queue, graph] = await Promise.all([pingDb(), pingQueue(), pingGraph()]);
    const ok = db.ok && queue.ok && graph.ok;
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "down", db, queue, graph });
  });
  return router;
}
