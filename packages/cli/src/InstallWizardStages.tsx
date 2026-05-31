// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { Field } from "./Field.tsx";
import type { LlmProviderChoice } from "./InstallWizard.tsx";

export interface FieldsStageProps {
  provider: LlmProviderChoice;
  apiKey: string;
  onApiKey: (v: string) => void;
  orModel: string;
  onOrModel: (v: string) => void;
  ollamaUrl: string;
  onOllamaUrl: (v: string) => void;
  ollamaModel: string;
  onOllamaModel: (v: string) => void;
  valid: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function FieldsStage({
  provider,
  apiKey,
  onApiKey,
  orModel,
  onOrModel,
  ollamaUrl,
  onOllamaUrl,
  ollamaModel,
  onOllamaModel,
  valid,
  onBack,
  onNext,
}: FieldsStageProps): ReactElement {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return && valid) {
      onNext();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>{provider === "openrouter" ? "OpenRouter configuration" : "Ollama configuration"}</Text>
      </Box>
      {provider === "openrouter" ? (
        <>
          <Field id="api-key" label="API key" value={apiKey} onChange={onApiKey} mask autoFocus />
          <Field id="or-model" label="Model" value={orModel} onChange={onOrModel} />
        </>
      ) : (
        <>
          <Field id="ollama-url" label="Ollama URL" value={ollamaUrl} onChange={onOllamaUrl} autoFocus />
          <Field id="ollama-model" label="Model name" value={ollamaModel} onChange={onOllamaModel} />
        </>
      )}
      <Box marginTop={1}>
        <Text dimColor>[Tab] next field [Enter] continue{valid ? "" : " (fill all fields)"} [Esc] back</Text>
      </Box>
    </Box>
  );
}

export interface RepoStageProps {
  indexUrl: string;
  onIndexUrl: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function RepoStage({ indexUrl, onIndexUrl, onBack, onNext }: RepoStageProps): ReactElement {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      onNext();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Index a GitHub repo after boot?</Text>
      </Box>
      <Field id="repo-url" label="Repo URL" value={indexUrl} onChange={onIndexUrl} autoFocus />
      <Box marginTop={1}>
        <Text dimColor>[Enter] next (blank = skip) [Esc] back</Text>
      </Box>
    </Box>
  );
}

export interface ConfirmStageProps {
  provider: LlmProviderChoice;
  apiKey: string;
  orModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  indexUrl: string;
  onBack: () => void;
  onDone: () => void;
}

export function ConfirmStage({
  provider,
  apiKey,
  orModel,
  ollamaUrl,
  ollamaModel,
  indexUrl,
  onBack,
  onDone,
}: ConfirmStageProps): ReactElement {
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return) {
      onDone();
    }
  });

  const maskedKey =
    apiKey.length === 0 ? "(none)" : `${"•".repeat(Math.min(apiKey.length, 8))}${apiKey.length > 8 ? "…" : ""}`;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Ready to apply — confirm settings</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text>
          {" "}
          Provider : <Text color="cyan">{provider}</Text>
        </Text>
        {provider === "openrouter" ? (
          <>
            <Text>
              {" "}
              API key : <Text dimColor>{maskedKey}</Text>
            </Text>
            <Text>
              {" "}
              Model : <Text color="cyan">{orModel || "(not set)"}</Text>
            </Text>
          </>
        ) : (
          <>
            <Text>
              {" "}
              URL : <Text color="cyan">{ollamaUrl || "(not set)"}</Text>
            </Text>
            <Text>
              {" "}
              Model : <Text color="cyan">{ollamaModel || "(not set)"}</Text>
            </Text>
          </>
        )}
        <Text>
          {" "}
          Index : <Text color="cyan">{indexUrl.trim().length > 0 ? indexUrl : "(skip)"}</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[Enter] apply & boot [Esc] back</Text>
      </Box>
    </Box>
  );
}
