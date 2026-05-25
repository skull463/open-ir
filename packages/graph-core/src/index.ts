import { KnowledgeState } from "@bb/types";
import type {
  KnowledgeDoc,
  NodeScope,
  RepoSummaryPayload,
  UpsertRepoNodeInput,
  FolderSummaryPayload,
  UpsertFolderNodeInput,
  SnapshotFilesInput,
  UpsertFileNodeInput,
  GraphPingResult,
} from "@bb/types";

export type {
  NodeScope,
  RepoSummaryPayload,
  UpsertRepoNodeInput,
  FolderSummaryPayload,
  UpsertFolderNodeInput,
  SnapshotFilesInput,
  UpsertFileNodeInput,
  GraphPingResult,
};

export interface IGraphKnowledgeRepository {
  upsertKnowledgeNode(doc: KnowledgeDoc): Promise<void>;
  setKnowledgeStateInGraph(knowledgeId: string, state: KnowledgeState): Promise<void>;
  setKnowledgeBranchInGraph(knowledgeId: string, branch: string): Promise<void>;
  deleteKnowledgeGraph(knowledgeId: string): Promise<void>;
}

export interface IGraphFileRepository {
  upsertFileNode(input: UpsertFileNodeInput): Promise<void>;
  deleteFileNodes(knowledgeId: string, paths: string[]): Promise<void>;
  snapshotFilesToVersion(input: SnapshotFilesInput): Promise<void>;
  upsertFileNodesBatch(inputs: readonly UpsertFileNodeInput[]): Promise<void>;
}

export interface IGraphFolderRepository {
  upsertFolderNode(input: UpsertFolderNodeInput): Promise<void>;
  upsertFolderNodesBatch(inputs: readonly UpsertFolderNodeInput[]): Promise<void>;
}

export interface IGraphRepoRepository {
  upsertRepoNode(input: UpsertRepoNodeInput): Promise<void>;
}

export interface IGraphIndexRepository {
  ensureKnowledgeIndexes(): Promise<void>;
  ensureFlatFolderIndexes(): Promise<void>;
}

export interface IGraphDatabaseProvider {
  knowledge: IGraphKnowledgeRepository;
  files: IGraphFileRepository;
  folders: IGraphFolderRepository;
  repo: IGraphRepoRepository;
  indexes: IGraphIndexRepository;

  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<GraphPingResult>;
  runCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
  toNeo4jInt?(value: number): unknown;
}
