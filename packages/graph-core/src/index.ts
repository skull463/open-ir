import { KnowledgeState } from "@bb/types";
import type { KnowledgeDoc } from "@bb/types";
import type { FileAnalysis } from "@bb/db-core";

export interface NodeScope {
  orgId: string;
  knowledgeId: string;
  repoId: string;
}

export interface RepoSummaryPayload {
  purpose: string;
  summary: string;
  keywords: string[];
  architecture: string;
  dataFlow: string;
  majorSubsystems: string[];
  keyPatterns: string[];
}

export interface UpsertRepoNodeInput {
  scope: NodeScope;
  repoUrl: string;
  branch: string;
  summary: RepoSummaryPayload;
}

export interface FolderSummaryPayload {
  purpose: string;
  summary: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  dependencyGraph: string;
}

export interface UpsertFolderNodeInput {
  scope: NodeScope;
  folderPath: string;
  summary: FolderSummaryPayload;
}

export interface SnapshotFilesInput {
  knowledgeId: string;
  commitHash: string;
}

export interface UpsertFileNodeInput {
  orgId?: string;
  knowledgeId: string;
  repoId?: string;
  relativePath: string;
  language: string;
  sha: string;
  sizeBytes: number;
  analysis: FileAnalysis;
  folderPath?: string;
  isBigFile?: boolean;
  totalChunks?: number;
  totalTokenCount?: number;
}

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
}

export interface IGraphFolderRepository {
  upsertFolderNode(input: UpsertFolderNodeInput): Promise<void>;
}

export interface IGraphRepoRepository {
  upsertRepoNode(input: UpsertRepoNodeInput): Promise<void>;
}

export interface IGraphIndexRepository {
  ensureKnowledgeIndexes(): Promise<void>;
  ensureFlatFolderIndexes(): Promise<void>;
}

export interface GraphPingResult {
  ok: boolean;
  latencyMs: number;
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
