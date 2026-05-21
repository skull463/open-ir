import type { FileAnalysis } from "./analysis.ts";

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

export interface GraphPingResult {
  ok: boolean;
  latencyMs: number;
}
