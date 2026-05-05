import { createHash } from "node:crypto";
import { upsertRawFile } from "@bb/mongo";
import { upsertFileNode } from "@bb/neo4j";
import { walkRepo } from "./scan.ts";
import { analyzeFile } from "./analyze.ts";
import type { IngestionContext, IngestionStrategy } from "./Strategy.ts";

export class BasicFileAnalysisStrategy implements IngestionStrategy {
  readonly name = "basic-file-analysis";

  async ingest({ knowledgeId, rootDir }: IngestionContext): Promise<void> {
    for await (const file of walkRepo(rootDir)) {
      const { language, analysis } = await analyzeFile(file.relativePath, file.content);
      const sha = sha256(file.content);
      await upsertRawFile({
        knowledgeId,
        relativePath: file.relativePath,
        content: file.content,
        sha,
        sizeBytes: file.sizeBytes,
        language,
        analysis,
      });
      await upsertFileNode({
        knowledgeId,
        relativePath: file.relativePath,
        language,
        sha,
        sizeBytes: file.sizeBytes,
        analysis,
      });
    }
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
