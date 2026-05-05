export interface IngestionContext {
  knowledgeId: string;
  rootDir: string;
}

export interface IngestionStrategy {
  readonly name: string;
  ingest(ctx: IngestionContext): Promise<void>;
}
