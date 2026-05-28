export interface DeleteKnowledgeResult {
  knowledgeDeleted: number;
  rawDeleted: number;
  statsDeleted?: number;
}

export interface DbPingResult {
  ok: boolean;
  latencyMs: number;
}
