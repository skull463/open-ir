import { KnowledgeState } from "@bb/types";
import type { KnowledgeDoc, KnowledgeFailureCategory } from "@bb/types";
import type { StatsResponse } from "@bb/types";
import type { ActivityInput } from "@bb/types";

export interface FileAnalysisSection {
  name: string;
  description: string;
}

export interface FileAnalysis {
  purpose: string;
  summary: string;
  businessContext: string;
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  keywords: string[];
  ontologyConcepts?: string[];
  businessEntities?: string[];
  systemCapabilities?: string[];
  sideEffects?: string[];
  configDependencies?: string[];
  dataFlowDirection?: string;
  integrationSurface?: string[];
  contractsProvided?: string[];
  contractsConsumed?: string[];
  sectionMap?: FileAnalysisSection[];
}

export interface RawFileDoc {
  knowledgeId: string;
  relativePath: string;
  content: string;
  sha: string;
  sizeBytes: number;
  language: string;
  analysis: FileAnalysis;
  updatedAt: Date;
}

export interface KnowledgeListEntry extends KnowledgeDoc {
  fileCount: number;
}

export interface DeleteKnowledgeResult {
  knowledgeDeleted: number;
  rawDeleted: number;
  statsDeleted?: number;
}

export interface IKnowledgeRepository {
  setKnowledgeState(knowledgeId: string, state: KnowledgeState): Promise<void>;
  setKnowledgeCommit(
    knowledgeId: string,
    commitHash: string,
    inputTokens?: string,
    outputTokens?: string,
    costUsd?: string,
  ): Promise<void>;
  setKnowledgeBranch(knowledgeId: string, branch: string): Promise<void>;
  updateKnowledgeProgress(knowledgeId: string, processedFiles: number, totalFiles?: number): Promise<void>;
  upsertKnowledge(doc: Omit<KnowledgeDoc, "updatedAt"> & { updatedAt?: Date }): Promise<void>;
  deleteKnowledge(knowledgeId: string): Promise<DeleteKnowledgeResult>;
  listKnowledge(opts?: { limit?: number }): Promise<KnowledgeListEntry[]>;
  getKnowledge(knowledgeId: string): Promise<KnowledgeListEntry | null>;
  markKnowledgeFailed(
    knowledgeId: string,
    reason: string,
    category: KnowledgeFailureCategory,
    detail?: string,
  ): Promise<void>;
}

export interface IRawRepository {
  upsertRawFile(doc: Omit<RawFileDoc, "updatedAt">): Promise<void>;
  listRawFileShas(knowledgeId: string): Promise<Map<string, string>>;
  deleteRawFiles(knowledgeId: string, relativePaths: string[]): Promise<number>;
}

export interface IAggregateStatsRepository {
  aggregateStats(): Promise<StatsResponse>;
}

export interface IActivityRepository {
  recordActivity(activity: ActivityInput): Promise<void>;
}

export interface IUsageRepository {
  incrementUsage(identityId: string, inputTokenCount?: number, outputTokenCount?: number): Promise<void>;
  getMonthlyUsage(year: number, month: number): Promise<unknown[]>;
  getGlobalUsage(): Promise<unknown[]>;
}

export interface DbPingResult {
  ok: boolean;
  latencyMs: number;
}

export interface IDocumentDatabaseProvider {
  knowledge: IKnowledgeRepository;
  raw: IRawRepository;
  stats: IAggregateStatsRepository;
  activity: IActivityRepository;
  usage: IUsageRepository;

  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<DbPingResult>;
}
