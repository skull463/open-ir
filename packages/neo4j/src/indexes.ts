import { _runCypher } from "./client.ts";

const CONSTRAINTS = [
  "CREATE CONSTRAINT knowledge_id IF NOT EXISTS FOR (k:Knowledge) REQUIRE k.knowledgeId IS UNIQUE",
  "CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.knowledgeId, f.relativePath) IS UNIQUE",
  "CREATE CONSTRAINT keyword_name IF NOT EXISTS FOR (kw:Keyword) REQUIRE kw.name IS UNIQUE",
  "CREATE CONSTRAINT class_signature IF NOT EXISTS FOR (c:Class) REQUIRE c.signature IS UNIQUE",
  "CREATE CONSTRAINT function_signature IF NOT EXISTS FOR (fn:Function) REQUIRE fn.signature IS UNIQUE",
  "CREATE CONSTRAINT module_name IF NOT EXISTS FOR (m:Module) REQUIRE m.name IS UNIQUE",
];

export async function ensureKnowledgeIndexes(): Promise<void> {
  for (const cypher of CONSTRAINTS) {
    try {
      await _runCypher(cypher);
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      if (msg.includes("already exists") || msg.includes("EquivalentSchemaRuleAlreadyExists")) {
        process.stderr.write(`[neo4j] schema already present, skipping: ${cypher.slice(0, 60)}…\n`);
        continue;
      }
      throw cause;
    }
  }
}
