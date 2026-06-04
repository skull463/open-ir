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
  UpsertConceptInput,
  AttachFileToConceptInput,
  UpsertContractInput,
  AttachFileToContractInput,
  UpsertGuidepostInput,
  AttachGuidepostInput,
  UpsertTestsEdgeInput,
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
  UpsertConceptInput,
  AttachFileToConceptInput,
  UpsertContractInput,
  AttachFileToContractInput,
  UpsertGuidepostInput,
  AttachGuidepostInput,
  UpsertTestsEdgeInput,
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
  upsertFileNodesBatch?(inputs: readonly UpsertFileNodeInput[]): Promise<void>;
  bulkUpsertFiles?(knowledgeId: string, fileStream: AsyncIterable<UpsertFileNodeInput>): Promise<void>;
}

export interface IGraphFolderRepository {
  upsertFolderNode(input: UpsertFolderNodeInput): Promise<void>;
  upsertFolderNodesBatch?(inputs: readonly UpsertFolderNodeInput[]): Promise<void>;
}

export interface IGraphRepoRepository {
  upsertRepoNode(input: UpsertRepoNodeInput): Promise<void>;
}

export interface IGraphIndexRepository {
  ensureKnowledgeIndexes(): Promise<void>;
  ensureFlatFolderIndexes(): Promise<void>;
  ensureConceptGraphIndexes(): Promise<void>;
}

/**
 * Concept-graph hypergraph writes — `:Concept` nodes plus the file-to-concept
 * edges (`HAS_CONCEPT` / `PLAYS_ROLE` / `BELONGS_TO_DOMAIN`) and the file-to-
 * file `:TESTS` edge. All canonical keys are scoped by `(orgId, knowledgeId)`.
 */
export interface IGraphConceptRepository {
  upsertConcept(input: UpsertConceptInput): Promise<void>;
  attachFileToConcept(input: AttachFileToConceptInput): Promise<void>;
  upsertTestsEdge(input: UpsertTestsEdgeInput): Promise<void>;
}

/** `:Contract` nodes + `DEFINES` / `CONSUMES` edges. */
export interface IGraphContractRepository {
  upsertContract(input: UpsertContractInput): Promise<void>;
  attachFileToContract(input: AttachFileToContractInput): Promise<void>;
}

/** `:Guidepost` nodes + polymorphic `ABOUT` edges. */
export interface IGraphGuidepostRepository {
  upsertGuidepost(input: UpsertGuidepostInput): Promise<void>;
  attachGuidepost(input: AttachGuidepostInput): Promise<void>;
}

export type SmartSearchChannel =
  | "purpose"
  | "businessContext"
  | "paths"
  | "keywords"
  | "classes"
  | "functions"
  | "importsInternal"
  | "importsExternal";

export interface SmartSearchChannelInput {
  knowledgeId: string | null;
  /**
   * Allowlist of knowledge IDs to constrain results to. When set, intersects
   * with `knowledgeId` if that's also set; when both are null the search is
   * unscoped (cross-repo). Used by ConceptGraphStrategy enrichment to query
   * its own in-flight knowledge plus opted-in cross-repo neighbours.
   */
  knowledgeIds: readonly string[] | null;
  pathPrefix: string | null;
  queryTerms: readonly string[];
  resultCap: number;
  excludeSuffixes: readonly string[];
  excludeContains: readonly string[];
}

export interface ScoredHit {
  path: string;
  knowledgeId: string;
  score: number;
}

export type KeywordLookupMatch = "keyword" | "class" | "function" | "module";

export interface KeywordLookupInput {
  match: KeywordLookupMatch;
  term: string;
  knowledgeId: string | null;
  /**
   * Allowlist of knowledge IDs to constrain results to. Intersects with
   * `knowledgeId` when both are set; null on both means cross-repo.
   */
  knowledgeIds: readonly string[] | null;
  keywordLimit: number;
  filesPerKeyword: number;
}

export interface KeywordLookupRow {
  name: string;
  path: string | null;
  purpose: string | null;
  summary: string | null;
  repoName: string | null;
  knowledgeId: string | null;
}

export interface KnowledgeListRow {
  knowledgeId: string;
  repoName: string;
  sourceKind: string;
  sourceUrl: string;
  branch: string | null;
  state: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface FileMetadataRow {
  path: string;
  language: string | null;
  sizeBytes: number | null;
  purpose: string | null;
  summary: string | null;
  businessContext: string | null;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
}

export interface RepoNameRow {
  knowledgeId: string;
  repoName: string | null;
}

export interface IGraphSearchRepository {
  runSmartSearchChannel(channel: SmartSearchChannel, params: SmartSearchChannelInput): Promise<ScoredHit[]>;
  keywordLookup(input: KeywordLookupInput): Promise<KeywordLookupRow[]>;
  listKnowledgeBases(): Promise<KnowledgeListRow[]>;
  fetchFileMetadata(knowledgeId: string, paths: readonly string[]): Promise<FileMetadataRow[]>;
  fetchRepoNames(knowledgeIds: readonly string[]): Promise<RepoNameRow[]>;
}

export interface IGraphDatabaseProvider {
  knowledge: IGraphKnowledgeRepository;
  files: IGraphFileRepository;
  folders: IGraphFolderRepository;
  repo: IGraphRepoRepository;
  indexes: IGraphIndexRepository;
  search: IGraphSearchRepository;
  concepts: IGraphConceptRepository;
  contracts: IGraphContractRepository;
  guideposts: IGraphGuidepostRepository;

  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<GraphPingResult>;
  runCypher(query: string, params?: Record<string, unknown>): Promise<unknown>;
  toNeo4jInt?(value: number): unknown;
}
