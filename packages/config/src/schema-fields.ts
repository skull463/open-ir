import type { BytebellConfig } from "./schema.ts";
import { Config } from "@bb/types";
import type { ConfigValue } from "./schema.ts";
import type { LogLevel, LlmProvider } from "./schema.ts";

export function readField<K extends Config>(cfg: BytebellConfig, key: K): ConfigValue<K> {
  switch (key) {
    case Config.ServerPort:
      return cfg.server_port as ConfigValue<K>;
    case Config.MongoUri:
      return cfg.mongo_uri as ConfigValue<K>;
    case Config.Neo4jUri:
      return cfg.neo4j_uri as ConfigValue<K>;
    case Config.Neo4jUser:
      return cfg.neo4j_user as ConfigValue<K>;
    case Config.Neo4jPassword:
      return cfg.neo4j_password as ConfigValue<K>;
    case Config.RedisUrl:
      return cfg.redis_url as ConfigValue<K>;
    case Config.OpenrouterApiKey:
      return cfg.openrouter_api_key as ConfigValue<K>;
    case Config.OpenrouterModel:
      return cfg.openrouter_model as ConfigValue<K>;
    case Config.OpenrouterFallbackModel1:
      return cfg.openrouter_fallback_model_1 as ConfigValue<K>;
    case Config.OpenrouterFallbackModel2:
      return cfg.openrouter_fallback_model_2 as ConfigValue<K>;
    case Config.OpenrouterFallbackModel3:
      return cfg.openrouter_fallback_model_3 as ConfigValue<K>;
    case Config.OpenrouterFallbackModel4:
      return cfg.openrouter_fallback_model_4 as ConfigValue<K>;
    case Config.ConcurrencyGithub:
      return cfg.concurrency.github as ConfigValue<K>;
    case Config.LogLevel:
      return cfg.log_level as ConfigValue<K>;
    case Config.LogRetentionDays:
      return cfg.log_retention_days as ConfigValue<K>;
    case Config.LlmCacheEnabled:
      return cfg.llm_cache_enabled as ConfigValue<K>;
    case Config.LlmProvider:
      return cfg.llm_provider as ConfigValue<K>;
    case Config.OllamaUrl:
      return cfg.ollama_url as ConfigValue<K>;
    case Config.OllamaModel:
      return cfg.ollama_model as ConfigValue<K>;
    case Config.ContextWindowLimit:
      return cfg["context.window.limit"] as ConfigValue<K>;
    case Config.MaxTokensPerChunk:
      return cfg["max.tokens.per.chunk"] as ConfigValue<K>;
    case Config.BigFileConcurrency:
      return cfg["big.file.concurrency"] as ConfigValue<K>;
    case Config.AbsoluteFileSizeCap:
      return cfg["absolute.file.size.cap"] as ConfigValue<K>;
    case Config.ConcurrentWorkers:
      return cfg["concurrent.workers"] as ConfigValue<K>;
    case Config.LlmConcurrency:
      return cfg["llm.concurrency"] as ConfigValue<K>;
    case Config.FolderSummaryBatchSize:
      return cfg["folder.summary.batch.size"] as ConfigValue<K>;
    case Config.FolderSummaryBatchMaxFiles:
      return cfg["folder.summary.batch.max.files"] as ConfigValue<K>;
    case Config.Neo4jBatchSize:
      return cfg["neo4j.batch.size"] as ConfigValue<K>;
    case Config.CondenseContextLimit:
      return cfg["condense.context.limit"] as ConfigValue<K>;
    case Config.CondensePromptOverhead:
      return cfg["condense.prompt.overhead"] as ConfigValue<K>;
    case Config.SmallFileDedupThreshold:
      return cfg["small.file.dedup.threshold"] as ConfigValue<K>;
    case Config.BigFileLineThreshold:
      return cfg["big.file.line.threshold"] as ConfigValue<K>;
    case Config.OrgId:
      return cfg.org_id as ConfigValue<K>;
    case Config.SkipDecisionEnabled:
      return cfg["skip.decision.enabled"] as ConfigValue<K>;
    case Config.SkipDecisionMaxCharsForLlm:
      return cfg["skip.decision.max.chars.for.llm"] as ConfigValue<K>;
    case Config.SkipDecisionCachePath:
      return cfg["skip.decision.cache.path"] as ConfigValue<K>;
    case Config.DbProvider:
      return cfg.db_provider as ConfigValue<K>;
    case Config.GraphProvider:
      return cfg.graph_provider as ConfigValue<K>;
    case Config.SqlitePath:
      return cfg.sqlite_path as ConfigValue<K>;
    default:
      throw new Error(`Unknown config key: ${key}`);
  }
}

export function writeField<K extends Config>(cfg: BytebellConfig, key: K, value: ConfigValue<K>): BytebellConfig {
  switch (key) {
    case Config.ServerPort:
      return { ...cfg, server_port: value as number };
    case Config.MongoUri:
      return { ...cfg, mongo_uri: value as string };
    case Config.Neo4jUri:
      return { ...cfg, neo4j_uri: value as string };
    case Config.Neo4jUser:
      return { ...cfg, neo4j_user: value as string };
    case Config.Neo4jPassword:
      return { ...cfg, neo4j_password: value as string };
    case Config.RedisUrl:
      return { ...cfg, redis_url: value as string };
    case Config.OpenrouterApiKey:
      return { ...cfg, openrouter_api_key: value as string };
    case Config.OpenrouterModel:
      return { ...cfg, openrouter_model: value as string };
    case Config.OpenrouterFallbackModel1:
      return { ...cfg, openrouter_fallback_model_1: value as string };
    case Config.OpenrouterFallbackModel2:
      return { ...cfg, openrouter_fallback_model_2: value as string };
    case Config.OpenrouterFallbackModel3:
      return { ...cfg, openrouter_fallback_model_3: value as string };
    case Config.OpenrouterFallbackModel4:
      return { ...cfg, openrouter_fallback_model_4: value as string };
    case Config.ConcurrencyGithub:
      return { ...cfg, concurrency: { ...cfg.concurrency, github: value as number } };
    case Config.LogLevel:
      return { ...cfg, log_level: value as LogLevel };
    case Config.LogRetentionDays:
      return { ...cfg, log_retention_days: value as number };
    case Config.LlmCacheEnabled:
      return { ...cfg, llm_cache_enabled: value as boolean };
    case Config.LlmProvider:
      return { ...cfg, llm_provider: value as LlmProvider };
    case Config.OllamaUrl:
      return { ...cfg, ollama_url: value as string };
    case Config.OllamaModel:
      return { ...cfg, ollama_model: value as string };
    case Config.ContextWindowLimit:
      return { ...cfg, "context.window.limit": value as number };
    case Config.MaxTokensPerChunk:
      return { ...cfg, "max.tokens.per.chunk": value as number };
    case Config.BigFileConcurrency:
      return { ...cfg, "big.file.concurrency": value as number };
    case Config.AbsoluteFileSizeCap:
      return { ...cfg, "absolute.file.size.cap": value as number };
    case Config.ConcurrentWorkers:
      return { ...cfg, "concurrent.workers": value as number };
    case Config.LlmConcurrency:
      return { ...cfg, "llm.concurrency": value as number };
    case Config.FolderSummaryBatchSize:
      return { ...cfg, "folder.summary.batch.size": value as number };
    case Config.FolderSummaryBatchMaxFiles:
      return { ...cfg, "folder.summary.batch.max.files": value as number };
    case Config.Neo4jBatchSize:
      return { ...cfg, "neo4j.batch.size": value as number };
    case Config.CondenseContextLimit:
      return { ...cfg, "condense.context.limit": value as number };
    case Config.CondensePromptOverhead:
      return { ...cfg, "condense.prompt.overhead": value as number };
    case Config.SmallFileDedupThreshold:
      return { ...cfg, "small.file.dedup.threshold": value as number };
    case Config.BigFileLineThreshold:
      return { ...cfg, "big.file.line.threshold": value as number };
    case Config.OrgId:
      throw new Error("org_id is fixed to 'local' in OSS builds and cannot be set");
    case Config.SkipDecisionEnabled:
      return { ...cfg, "skip.decision.enabled": value as boolean };
    case Config.SkipDecisionMaxCharsForLlm:
      return { ...cfg, "skip.decision.max.chars.for.llm": value as number };
    case Config.SkipDecisionCachePath:
      return { ...cfg, "skip.decision.cache.path": value as string };
    case Config.DbProvider:
      return { ...cfg, db_provider: value as string };
    case Config.GraphProvider:
      return { ...cfg, graph_provider: value as string };
    case Config.SqlitePath:
      return { ...cfg, sqlite_path: value as string };
    default:
      throw new Error(`Unknown config key: ${key}`);
  }
}
