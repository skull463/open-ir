import type {
  IGraphDatabaseProvider,
  IGraphKnowledgeRepository,
  IGraphFileRepository,
  IGraphFolderRepository,
  IGraphRepoRepository,
  IGraphIndexRepository,
  GraphPingResult,
} from "@bb/graph-core";

let activeProvider: IGraphDatabaseProvider | null = null;
const providers = new Map<string, () => IGraphDatabaseProvider>();

export function registerGraphProvider(name: string, factory: () => IGraphDatabaseProvider) {
  providers.set(name, factory);
}

export function getGraph(): IGraphDatabaseProvider {
  if (!activeProvider) {
    throw new Error("Graph database provider not initialized. Call connectGraph() first.");
  }
  return activeProvider;
}

export async function connectGraph(providerName: string): Promise<void> {
  const factory = providers.get(providerName);
  if (!factory) {
    throw new Error(`Graph database provider '${providerName}' not registered.`);
  }
  activeProvider = factory();
  await activeProvider.connect();
}

export async function closeGraph(): Promise<void> {
  if (activeProvider) {
    await activeProvider.close();
    activeProvider = null;
  }
}

export const knowledge: IGraphKnowledgeRepository = {
  upsertKnowledgeNode: (...args) => getGraph().knowledge.upsertKnowledgeNode(...args),
  setKnowledgeStateInGraph: (...args) => getGraph().knowledge.setKnowledgeStateInGraph(...args),
  setKnowledgeBranchInGraph: (...args) => getGraph().knowledge.setKnowledgeBranchInGraph(...args),
  deleteKnowledgeGraph: (...args) => getGraph().knowledge.deleteKnowledgeGraph(...args),
};

export const files: IGraphFileRepository = {
  upsertFileNode: (...args) => getGraph().files.upsertFileNode(...args),
  deleteFileNodes: (...args) => getGraph().files.deleteFileNodes(...args),
  snapshotFilesToVersion: (...args) => getGraph().files.snapshotFilesToVersion(...args),
};

export const folders: IGraphFolderRepository = {
  upsertFolderNode: (...args) => getGraph().folders.upsertFolderNode(...args),
};

export const repo: IGraphRepoRepository = {
  upsertRepoNode: (...args) => getGraph().repo.upsertRepoNode(...args),
};

export const indexes: IGraphIndexRepository = {
  ensureKnowledgeIndexes: (...args) => getGraph().indexes.ensureKnowledgeIndexes(...args),
  ensureFlatFolderIndexes: (...args) => getGraph().indexes.ensureFlatFolderIndexes(...args),
};

export async function pingGraph(): Promise<GraphPingResult> {
  return getGraph().ping();
}

export async function runCypher(query: string, params?: Record<string, unknown>): Promise<unknown> {
  return getGraph().runCypher(query, params);
}

export function toNeo4jInt(value: number): unknown {
  const provider = getGraph();
  if (provider.toNeo4jInt) {
    return provider.toNeo4jInt(value);
  }
  return value;
}
