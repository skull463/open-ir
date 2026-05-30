import { useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Config, DbProviderType, GraphProviderType } from "@bb/types";
import { getConfigValue } from "@bb/config";
import { KEY_MAP } from "./keyMap.ts";
import { Field } from "./Field.tsx";
import { ToggleField } from "./ToggleField.tsx";

interface Toggle {
  id: string;
  label: string;
  cliKey: string;
  options: readonly [string, string];
}

const GRAPH_OPTIONS: readonly [string, string] = [GraphProviderType.Neo4j, GraphProviderType.Ladybug];
const DB_OPTIONS: readonly [string, string] = [DbProviderType.Mongo, DbProviderType.Sqlite];

const TOGGLES: Toggle[] = [
  { id: "graph-provider", label: "Graph provider", cliKey: "graph-provider", options: GRAPH_OPTIONS },
  { id: "db-provider", label: "Doc store", cliKey: "db-provider", options: DB_OPTIONS },
];

function pickToggle(current: string, options: readonly [string, string]): string {
  return options.includes(current) ? current : options[0];
}

interface Row {
  id: string;
  label: string;
  cliKey: string;
  mask?: boolean;
  validate: (raw: string) => string | null;
}

const MONGO_RX = /^mongodb(\+srv)?:\/\//u;
const NEO4J_RX = /^(bolt|neo4j)(\+s|\+ssc)?:\/\//u;
const REDIS_RX = /^rediss?:\/\//u;

const ROWS: Row[] = [
  {
    id: "mongo",
    label: "Mongo URI",
    cliKey: "mongo",
    validate: (s) => (MONGO_RX.test(s) ? null : "expected mongodb:// or mongodb+srv://"),
  },
  {
    id: "neo4j",
    label: "Neo4j URI",
    cliKey: "neo4j",
    validate: (s) => (NEO4J_RX.test(s) ? null : "expected bolt:// or neo4j://"),
  },
  { id: "neo4j-user", label: "Neo4j user", cliKey: "neo4j-user", validate: (s) => (s.length > 0 ? null : "required") },
  {
    id: "neo4j-password",
    label: "Neo4j password",
    cliKey: "neo4j-password",
    mask: true,
    validate: (s) => (s.length > 0 ? null : "required"),
  },
  {
    id: "redis",
    label: "Redis URL",
    cliKey: "redis",
    validate: (s) => (REDIS_RX.test(s) ? null : "expected redis:// or rediss://"),
  },
  {
    id: "port",
    label: "Server port",
    cliKey: "port",
    validate: (s) => (/^\d+$/u.test(s) && Number(s) > 0 && Number(s) <= 65535 ? null : "expected integer 1-65535"),
  },
  {
    id: "concurrency-github",
    label: "GitHub Concurrency",
    cliKey: "concurrency.github",
    validate: (s) => (/^\d+$/u.test(s) && Number(s) > 0 ? null : "expected positive integer"),
  },
];

function loadInitial(): Record<string, string> {
  return {
    mongo: getConfigValue(Config.MongoUri),
    neo4j: getConfigValue(Config.Neo4jUri),
    "neo4j-user": getConfigValue(Config.Neo4jUser),
    "neo4j-password": getConfigValue(Config.Neo4jPassword),
    redis: getConfigValue(Config.RedisUrl),
    port: String(getConfigValue(Config.ServerPort)),
    "concurrency-github": String(getConfigValue(Config.ConcurrencyGithub)),
    "graph-provider": pickToggle(getConfigValue(Config.GraphProvider), GRAPH_OPTIONS),
    "db-provider": pickToggle(getConfigValue(Config.DbProvider), DB_OPTIONS),
  };
}

export interface SetupFormProps {
  onDone: (result: { saved: boolean; error?: string }) => void;
}

export function SetupForm({ onDone }: SetupFormProps): ReactElement {
  const { exit } = useApp();
  const [values, setValues] = useState<Record<string, string>>(() => loadInitial());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors: Record<string, string | null> = {};
  for (const row of ROWS) {
    errors[row.id] = row.validate(values[row.id] ?? "");
  }
  const allValid = ROWS.every((r) => errors[r.id] === null);

  useInput((_input, key) => {
    if (key.escape) {
      exit();
      onDone({ saved: false });
      return;
    }
    if (key.return && allValid && submitError === null) {
      try {
        for (const row of ROWS) {
          const entry = KEY_MAP[row.cliKey];
          if (entry === undefined) {
            throw new Error(`No KEY_MAP entry for "${row.cliKey}"`);
          }
          entry.setter(values[row.id] ?? "");
        }
        for (const t of TOGGLES) {
          const entry = KEY_MAP[t.cliKey];
          if (entry === undefined) {
            throw new Error(`No KEY_MAP entry for "${t.cliKey}"`);
          }
          entry.setter(values[t.id] ?? t.options[0]);
        }
        exit();
        onDone({ saved: true });
      } catch (cause: unknown) {
        setSubmitError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Bytebell setup</Text>
      </Box>
      {ROWS.map((row) => (
        <Field
          key={row.id}
          id={row.id}
          label={row.label}
          value={values[row.id] ?? ""}
          onChange={(next) => setValues((prev) => ({ ...prev, [row.id]: next }))}
          {...(row.mask === true ? { mask: true } : {})}
          {...(errors[row.id] !== null ? { error: errors[row.id] ?? "" } : {})}
        />
      ))}
      {TOGGLES.map((t) => (
        <ToggleField
          key={t.id}
          id={t.id}
          label={t.label}
          value={values[t.id] ?? t.options[0]}
          options={t.options}
          onChange={(next) => setValues((prev) => ({ ...prev, [t.id]: next }))}
        />
      ))}
      <Box marginTop={1}>
        <Text dimColor>[Tab] next [Shift-Tab] back [←/→] switch [Enter] save [Esc] quit</Text>
      </Box>
      {submitError !== null && (
        <Box marginTop={1}>
          <Text color="red">save failed: {submitError}</Text>
        </Box>
      )}
    </Box>
  );
}
