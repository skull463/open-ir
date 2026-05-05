import type { Request, Response, Router } from "express";
import express from "express";
import { listKnowledge } from "@bb/mongo";

export function buildReposRoute(): Router {
  const router = express.Router();
  router.get("/api/v1/repos", async (_req: Request, res: Response) => {
    const entries = await listKnowledge();
    const repos = entries.map((e) => ({
      knowledgeId: e.knowledgeId,
      source: e.source,
      state: e.status.state,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : new Date(e.createdAt).toISOString(),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : new Date(e.updatedAt).toISOString(),
      fileCount: e.fileCount,
    }));
    res.status(200).json({ repos });
  });
  return router;
}
