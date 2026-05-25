import { connectNeo4j, closeNeo4j, pingNeo4j, _runCypher, toNeo4jInt } from "./client.ts";
import * as knowledgeRepo from "./knowledge.ts";
import * as filesRepo from "./files.ts";
import * as fileVersionsRepo from "./fileVersions.ts";
import * as folderRepo from "./folder.ts";
import * as repoRepo from "./repo.ts";
import * as indexRepo from "./indexes.ts";
import * as flatFolderIndexRepo from "./flatFolderIndexes.ts";

import { registerGraphProvider } from "@bb/graph-db";
import type { IGraphDatabaseProvider } from "@bb/graph-core";

class Neo4jGraphProvider implements IGraphDatabaseProvider {
  knowledge = {
    upsertKnowledgeNode: knowledgeRepo.upsertKnowledgeNode,
    setKnowledgeStateInGraph: knowledgeRepo.setKnowledgeStateInGraph,
    setKnowledgeBranchInGraph: knowledgeRepo.setKnowledgeBranchInGraph,
    deleteKnowledgeGraph: knowledgeRepo.deleteKnowledgeGraph,
  };

  files = {
    upsertFileNode: filesRepo.upsertFileNode,
    deleteFileNodes: filesRepo.deleteFileNodes,
    snapshotFilesToVersion: fileVersionsRepo.snapshotFilesToVersion,
    upsertFileNodesBatch: filesRepo.upsertFileNodesBatch,
  };

  folders = {
    upsertFolderNode: folderRepo.upsertFolderNode,
    upsertFolderNodesBatch: folderRepo.upsertFolderNodesBatch,
  };

  repo = {
    upsertRepoNode: repoRepo.upsertRepoNode,
  };

  indexes = {
    ensureKnowledgeIndexes: indexRepo.ensureKnowledgeIndexes,
    ensureFlatFolderIndexes: flatFolderIndexRepo.ensureFlatFolderIndexes,
  };

  async connect(): Promise<void> {
    await connectNeo4j();
  }

  async close(): Promise<void> {
    await closeNeo4j();
  }

  async ping() {
    return pingNeo4j();
  }

  async runCypher(query: string, params?: Record<string, unknown>): Promise<unknown> {
    return _runCypher(query, params);
  }

  toNeo4jInt(value: number): unknown {
    return toNeo4jInt(value);
  }
}

registerGraphProvider("neo4j", () => new Neo4jGraphProvider());
