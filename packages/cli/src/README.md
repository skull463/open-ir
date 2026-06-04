# `@bb/cli/src` — context

Implementation of `@bb/cli`. See [../README.md](../README.md) for the
package-level contract; this file documents how the source tree is split.

## Files

- **[index.ts](index.ts)** — binary entry. Shebang `#!/usr/bin/env bun`.
  A bare `bytebell` (no argv beyond node + script) calls `runMenu()` to
  open the interactive TUI menu; anything else (a subcommand, `--help`,
  `--version`) is built via `buildProgram()` and handed to `parseAsync`.
  Top-level `try/catch` prints any uncaught error and exits `2` (the
  typed-error path through commander handlers exits `1`).
- **[program.ts](program.ts)** — `buildProgram()` constructs the
  commander `Command("bytebell")`, wires `VERSION`, and registers every
  shipped subcommand: `set`, `boot`, `shutdown`, `server`, `index`,
  `ingest`, `pull`, `ls`, `delete`, `stats`, `mcp`, `migrate`, `menu`.
  Extracted from `index.ts` so `MenuCommand` can build a fresh program
  to dispatch a chosen command. Single source of truth for the command
  list. Also re-exports `VERSION` (from `version.ts`).
- **[version.ts](version.ts)** — leaf module exporting the `VERSION`
  string, shared by `program.ts` and the menu footer. Separate file to
  avoid an `index ↔ program ↔ MenuCommand` import cycle.
- **[MenuCommand.ts](MenuCommand.ts)** — the `menu` subcommand and the
  `runMenu()` orchestrator (also the default when `bytebell` is run with
  no args). Owns the `GROUPS` layout (SETUP / KNOWLEDGE / SERVER /
  INSIGHTS) and the `ARG_SPECS` table of which commands need positional
  args prompted. Flow: render `<MenuSelector />` → on the synthetic
  `configure-llm` id render `<LlmConfigForm />`; on an arg-taking command
  render `<ArgPrompt />` then dispatch; otherwise dispatch immediately.
  `dispatch()` builds a fresh `buildProgram()` and `parseAsync`es
  `[node, script, command, ...args]`.
- **[MenuSelector.tsx](MenuSelector.tsx)** — the top-level command picker.
  Takes grouped `MenuGroup[]`; renders labelled sections with a per-item
  glyph, but the cursor walks a single flat order skipping headers.
  ↑/↓ or j/k move (wrapping), Enter selects, Esc/q quits. Header is the
  `Bytebell` wordmark + dim `local knowledge engine · open-ir` subtitle;
  footer is a `<ControlsBar />` with the version right-aligned.
- **[ControlsBar.tsx](ControlsBar.tsx)** — the universal footer key legend.
  Renders each `{ keys, label }` as a bold inverse "cap" (`ACCENT` purple bg
  / white) plus a bold white label, so the control hints look identical on
  every screen. Adds no outer padding (callers place it); an optional
  `version` is pushed dim-right via `space-between`. Used by `MenuSelector`,
  `ArgPrompt`, and both phases of `LlmConfigForm`.
- **[theme.ts](theme.ts)** — single-source brand accent. Exports `ACCENT`
  (`#a855f7`, Bytebell purple) used for cursors, active rows, form
  highlights, and the control-key caps across every TUI component (menu,
  forms, and the legacy pickers — RepoSelector, BranchSelector,
  CommitSelector, LsInteractive, etc.). Replaced the previous cyan accent.
- **[LlmConfigForm.tsx](LlmConfigForm.tsx)** — dedicated two-phase form
  for the LLM provider config. Phase 1 (`ProviderPicker`): choose
  openrouter or ollama. Phase 2 (`FieldsForm`): edit just that provider's
  fields — OpenRouter API key (masked) + model, or Ollama URL + model —
  via Ink's focus manager (Tab/Shift-Tab), Enter saves all rows through
  `KEY_MAP` setters (`llm-provider` plus the field keys), Esc steps back
  to the provider choice. Pre-filled from `getConfigValue`.
- **[ArgPrompt.tsx](ArgPrompt.tsx)** — one-field-at-a-time positional-arg
  collector for menu-launched commands (`index` → git-url, `ingest` →
  optional path). Enter advances / submits, Esc returns to the menu,
  required fields refuse to advance while empty.
- **[SetCommand.ts](SetCommand.ts)** — the `set` subcommand. Two
  optional positional args. Both provided → headless flow: looks up
  `KEY_MAP[key]`, runs `entry.setter(value)`, prints success (or the
  redacted form for password-bearing keys). Neither provided → renders
  `<SetupForm />` via `ink.render`. Mismatched args → friendly error.
- **[keyMap.ts](keyMap.ts)** — the dispatch table from CLI key strings
  to typed `setConfigValue<K>` calls. Each entry is a closure that owns
  its own type narrowing — no `as` casts at the call site. Local
  helpers `parsePort` / `parsePositiveInt` / `parseLogLevel` throw
  `Error("Invalid value for \"<key>\": …")` which `SetCommand` pretty-
  prints with the matching `bytebell set …` hint from `@bb/config`'s
  `HINTS`. Carries entries for every config key the user can set
  headlessly today, including `openrouter-api-key` (`redact: true`)
  and `openrouter-model` (plain text).
- **[BootCommand.ts](BootCommand.ts)** — the `boot` subcommand.
  Sequence: `checkPreflight` (errors out with `HINTS` if openrouter
  api-key/model are blank) → `applyInfraDefaults` (auto-fills the
  blank infra keys, generates a random Neo4j password if needed) →
  `dockerInfra.up` (writes `.env`, runs compose, polls health) →
  `ensureServerRunning` (existing helper that lazy-spawns the server
  and polls `/health`). Prints a final ready banner with the MCP URL.
  Idempotent — re-running on an already-up stack is a fast no-op.
- **[ShutdownCommand.ts](ShutdownCommand.ts)** — the `shutdown`
  subcommand. Resolves the target pids from **two sources** — the live
  process(es) holding the configured server port (`lsof -nP -iTCP:<port>
-sTCP:LISTEN -t`) plus a still-alive pid from `~/.bytebell/pid` — so a
  stale pid file (e.g. a double-start where the loser died on the
  port-bind conflict without unlinking) no longer hides the real server.
  Sends `SIGTERM` to each, polls until **no process holds the port**
  (≤ 30 s), unlinks any leftover pid file, and prints the explicit
  `docker compose down` hint (or stops Docker when
  `--with-docker`/the prompt says so). Docker is left running by
  default. No process on the port and no live pid → "server is not
  running" and exits 0. Never escalates to `SIGKILL`.
- **[bootConfig.ts](bootConfig.ts)** — `applyInfraDefaults` writes
  local-docker defaults (mongo / neo4j / neo4j-user / redis) and a
  random base64url 24-byte Neo4j password into `~/.bytebell/config.json`
  via `KEY_MAP[key].setter`, but only for keys that are currently
  blank. Returns the resolved Neo4j password (whether freshly
  generated or pre-existing) so `BootCommand` can pass it into
  `dockerInfra.up`. `checkPreflight` reads `openrouter_api_key` and
  `openrouter_model` and returns the missing entries with their
  `Config` enum value (so `BootCommand` can look up the right hint).
- **[dockerInfra.ts](dockerInfra.ts)** — wraps `docker compose -f
<abs>/infra/docker/docker-compose.yml up -d` (stdout/stderr
  inherited so the user sees pulls + start), then polls
  `docker compose ps --format json` every 2 s for ≤ 90 s until all
  three services report `Health: healthy`. Resolves the compose path
  via `import.meta.url` so it works under `bun link`. Writes
  `infra/docker/.env` (mode `0600`) with `NEO4J_PASSWORD=<value>`
  before `up`. Typed errors: `DockerNotFoundError` (no `docker` on
  PATH), `DockerComposeError` (non-zero compose exit), and
  `DockerHealthTimeoutError` (services still not healthy after the
  poll budget). `parsePsOutput` accepts both the JSON-array and
  newline-delimited-JSON formats compose ships across versions.
- **[output.ts](output.ts)** — three small print helpers:
  `success(line)`, `error(line, hint?)`, `list(label, items)`. Manual
  ANSI escapes wrapped behind a `stream.isTTY` check. Plain text on
  non-TTY (CI, pipes).
- **[Field.tsx](Field.tsx)** — single Ink row component used inside
  `SetupForm`. Renders an indicator + label + either an `ink-text-input`
  (when focused) or a static text view of the value (when not). Masking
  via `ink-text-input`'s `mask` prop on the password row; non-focused
  view shows `•••…` for masked rows. Renders an inline red error line
  underneath when the field's `validate` returns a non-null string.
- **[SetupForm.tsx](SetupForm.tsx)** — the Ink form rendered by
  `bytebell set` no-args. Six rows declared in a `ROWS` constant: Mongo
  URI / Neo4j URI / Neo4j user / Neo4j password (masked) / Redis URL /
  Server port. Each row carries its own format-only `validate` regex.
  State: a single `useState<Record<string,string>>` keyed by row id and
  seeded from `loadConfig()` so users see and edit existing settings.
  Navigation via Ink's built-in `useFocusManager` (Tab / Shift-Tab). On
  Enter when all rows pass validation, iterates the dispatch table in
  row order calling `entry.setter(value)`. On Esc, exits without saving.

## Module dependency graph

```
output.ts          → (leaf — no imports)
keyMap.ts          → @bb/types (Config), @bb/config (LOG_LEVELS, setConfigValue, LogLevel)
Field.tsx          → ink, ink-text-input, react (type-only)
SetupForm.tsx      → ink, react, @bb/types (Config), @bb/config (getConfigValue),
                     keyMap.ts (KEY_MAP), Field.tsx (Field)
SetCommand.ts      → commander, react, ink (render), @bb/config (HINTS),
                     keyMap.ts (KEY_MAP, validKeysList), SetupForm.tsx (SetupForm),
                     output.ts (error, list, success)

bootConfig.ts      → node:crypto, @bb/types (Config), @bb/config (getConfigValue),
                     keyMap.ts (KEY_MAP)
dockerInfra.ts     → node:child_process, node:fs/promises, node:path, node:url
BootCommand.ts     → commander, @bb/types (Config), @bb/config (HINTS, getConfigValue),
                     bootConfig.ts, dockerInfra.ts, serverSpawn.ts, output.ts
ShutdownCommand.ts → commander, node:fs/promises, node:child_process (execFile), node:path,
                     @bb/config (getBytebellHome, getConfigValue), @bb/types (Config),
                     dockerInfra.ts (composeFilePath, down), output.ts, shutdownPrompts.ts

httpClient.ts      → node:url
serverSpawn.ts     → node:child_process, node:fs/promises, node:path, node:url,
                     @bb/types (Config), @bb/config (getBytebellHome, getConfigValue)

ServerCommand.ts   → commander, node:child_process, node:path, node:url, output.ts
IndexCommand.ts    → commander, serverSpawn.ts, httpClient.ts, output.ts
IngestCommand.ts   → commander, node:fs/promises, node:path, serverSpawn.ts,
                     httpClient.ts, output.ts
LsCommand.ts       → commander, serverSpawn.ts, httpClient.ts, output.ts

version.ts         → (leaf — no imports)
ControlsBar.tsx    → ink, react (type-only)
MenuSelector.tsx   → ink, react (type-only), version.ts (VERSION), ControlsBar.tsx
ArgPrompt.tsx      → ink, react (type-only), Field.tsx (Field), ControlsBar.tsx
LlmConfigForm.tsx  → ink, react, @bb/types (Config), @bb/config (getConfigValue),
                     keyMap.ts (KEY_MAP), Field.tsx (Field), ControlsBar.tsx
MenuCommand.ts     → commander, react, ink (render), MenuSelector.tsx, LlmConfigForm.tsx,
                     ArgPrompt.tsx, program.ts (buildProgram), output.ts (info, success)
program.ts         → commander, every buildXCommand (incl. MenuCommand), version.ts
index.ts           → program.ts (buildProgram), MenuCommand.ts (runMenu), output.ts (error)
```

`program.ts` imports `MenuCommand.ts` (for `buildMenuCommand`) and
`MenuCommand.ts` imports `program.ts` (for `buildProgram`) — this cycle is
safe because both bindings are only invoked at runtime, never at module
load. `version.ts` is the leaf that keeps the version string out of the
cycle.

No cycles. `output.ts` is a leaf; `keyMap.ts` and `httpClient.ts` are
near-leaves. `serverSpawn.ts` and `dockerInfra.ts` both manage foreign
child processes and own no in-process state beyond a small per-call
context.

## Invariants enforced here

- **Shebang lives only in `index.ts`.** It is the binary entry; other
  files are imported.
- **Headless setter calls go through `KEY_MAP[key].setter`.** No file
  outside `keyMap.ts` calls `setConfigValue` directly. This keeps the
  type-narrowing closures the single source of truth and keeps password
  redaction (`entry.redact`) co-located with the setter.
- **Form runs format-only validation.** No network, no driver imports.
  Validators in `SetupForm.tsx`'s `ROWS` are pure regex / range checks.
- **Submit is atomic per call but not per form.** The form iterates
  six setters; each is its own atomic `setConfigValue` write. If one
  throws mid-loop, the form re-renders with the row's error highlighted
  and earlier fields stay written. Trade-off: rolling back partial
  writes would require a transaction abstraction in `@bb/config` that
  doesn't exist; the form's per-field format validation makes mid-loop
  failures essentially impossible in practice.
- **No raw `setConfigValue` casts.** Each `KEY_MAP` closure invokes
  `setConfigValue<Config.X>(Config.X, value)` so TypeScript checks the
  value type against `ConfigValueMap[Config.X]`. Adding a key without
  a closure (or with a wrong-type setter) is a compile error.
- **No env reads anywhere.** Repo-wide ESLint rule blocks `process.env`.
- **`bootConfig.applyInfraDefaults` only writes blank keys.** Re-running
  `bytebell boot` after a manual `bytebell set neo4j-password <new>`
  reads the user's value back via `getConfigValue` and uses it for
  the compose `.env`; it does **not** overwrite the user's choice.
- **`dockerInfra` resolves the compose file via `import.meta.url`.**
  No env vars, no cwd dependence — `bytebell boot` works from any
  directory and from `bun link`'d installs.
- **`ShutdownCommand` never escalates to `SIGKILL`.** If the server
  doesn't drain in 30 s the command exits 1 with a warning; the
  operator decides whether to force-kill. Matches the server's own
  shutdown timeout.

## Adding a Field

1. Add a row to `ROWS` in `SetupForm.tsx` — `{ id, label, cliKey, mask?, validate }`.
2. Confirm `KEY_MAP[cliKey]` exists in `keyMap.ts` (add it there if not).
3. Add the new key to the `loadInitial()` seed object so the field
   pre-populates from the existing config.
4. The form auto-renders the row in declaration order; no other
   wiring needed.
