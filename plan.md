# Plan — Extract a provider-neutral ingestion engine (`@bb/ingest-core`)

## Why

Today the entire ingestion engine — the strategy interface, both strategies
(`flat-folder`, `concept-graph`), the pipeline runner, the disk source reader, the
commit-scoped path layout, and the worker handlers — lives inside `@bb/ingest-github`.
The engine is already provider-agnostic in practice (strategies consume a `SourceReader`,
never a git host), but two couplings force every non-GitHub host to masquerade as GitHub:

1. **Package coupling** — the reusable engine is exported from a package literally named
   `@bb/ingest-github`, so any GitLab/Bitbucket package must `import … from "@bb/ingest-github"`.
2. **Payload coupling** — the runner, `SourceFactory`, and `StrategyInput` type their
   `payload` as `GithubIndexPayload`. In the enterprise repo, the GitLab handler builds a
   throwaway `githubShaped: GithubIndexPayload = {…}` for every job just to satisfy the type.

**Goal:** move the strategies + engine into a provider-neutral `@bb/ingest-core`, give the
runner a neutral `RepoIndexPayload`, and add a `GitProvider` interface + registry (dispatched
by repo-URL host, analogous to the `askLLM` provider switch). Then GitLab and Bitbucket become
thin provider packages that depend on `@bb/ingest-core` — no `@bb/ingest-github` import, no
payload shaping.

**Scope (this pass):** engine extraction + `GitProvider` seam + GitHub as the single working
provider. The GitLab/Bitbucket packages are **not** built here — only made trivial to add.

## Target architecture

```
@bb/ingest-core   (NEW, Domain tier)  — provider-neutral engine
  ├─ IngestStrategy + StrategyInput/Result/Context
  ├─ SourceReader / SourceFactory / PullFactory / ArchiveSink
  ├─ GitProvider interface + registry  (resolveProvider(repoUrl, hint?))
  ├─ pipeline runner (createPipelineRunner, runPull) + handlers framework
  ├─ createDiskSourceReader, pathsFor, ensureCommitDirs, bootstrapRuntime, reposRoot
  ├─ strategies/{flat-folder,concept-graph}, prompts, progress, skip-decisions
  └─ consumes RepoIndexPayload (NEUTRAL), never GithubIndexPayload
        ▲                          ▲                          ▲
@bb/ingest-github          @bb/ingest-gitlab*         @bb/ingest-bitbucket*
 GitHubProvider:            (future, thin)             (future, thin)
   githubUrl / githubApi / githubCommit + git clone-auth (source.ts)
```

`*` not built in this pass. Imports flow one way: providers → core → infra → kernel. Only
`@bb/server` (binary) imports both core and a provider and wires them at boot — no cycle.

## The `GitProvider` seam

The LLM seam picks one global provider from `Config.LlmProvider`. Git hosts differ: a single
install can index github.com **and** gitlab.com repos, so the host is per-repo, resolved from
the URL. Hence a **registry** keyed by hostname rather than a fixed ternary.

```ts
// @bb/ingest-core/src/provider/types.ts
export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
}

export type DefaultBranchResult =
  | { status: "ok"; branch: string }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}
export type FetchCommitsResult =
  | { status: "ok"; commits: CommitEntry[] }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export interface GitHostApi {
  fetchDefaultBranch(repoUrl: string, gitToken?: string): Promise<DefaultBranchResult>;
  fetchBranches(
    repoUrl: string,
    gitToken?: string,
    limit?: number,
  ): Promise<{ status: "ok"; branches: string[] } | { status: "error"; message: string }>;
  fetchLatestCommitHash(repoUrl: string, branch: string, gitToken?: string): Promise<string | null>;
  fetchRecentCommits(repoUrl: string, branch: string, limit: number, gitToken?: string): Promise<FetchCommitsResult>;
}

export interface CloneOptions {
  repoUrl: string;
  branch: string;
  destinationDir: string;
  gitToken?: string;
}

export interface GitProvider {
  readonly id: string; // "github"
  matches(repoUrl: string): boolean; // hostname predicate
  parse(repoUrl: string): ParsedRepo | null;
  readonly api: GitHostApi;
  /** Clone (or fetch+reset) the branch into destinationDir; resolves the post-clone HEAD sha
   *  ("unknown" if it can't be read). Keeps all git/auth code in the provider package. */
  clone(opts: CloneOptions): Promise<string>;
}
```

```ts
// @bb/ingest-core/src/provider/registry.ts
const registry = new Map<string, GitProvider>();
export function registerGitProvider(p: GitProvider): void {
  registry.set(p.id, p);
}
export function listGitProviders(): GitProvider[] {
  return [...registry.values()];
}
/** Explicit hint (provider id) wins for self-hosted hosts; else first matches() by hostname. */
export function resolveProvider(repoUrl: string, hint?: string): GitProvider {
  if (hint !== undefined) {
    const p = registry.get(hint);
    if (p) return p;
  }
  for (const p of registry.values()) if (p.matches(repoUrl)) return p;
  throw new UnsupportedRepoHostError(repoUrl);
}
```

Making `clone()` return the HEAD sha lets `syncRepository`/`readHeadCommitHash` stay entirely
in `@bb/ingest-github` — core carries no git-specific code.

## Steps (each ends green: `bun run typecheck`)

1. **Skeleton** — `packages/ingest-core/{package.json (done), tsconfig.json, README.md}`; `bun install` to link `@bb/ingest-core`.
2. **Neutral payload + error** — `packages/types/src/job.ts`: add `RepoIndexPayload`/`RepoPullPayload`
   (= today's Github payloads + optional `provider?` host hint); keep `GithubIndexPayload`/`GithubPullPayload`
   as back-compat aliases; `JobType` enum unchanged (Redis queue/dedupe keys untouched). Add
   `UnsupportedRepoHostError` to `packages/errors/src/ingest-errors.ts` + export it.
3. **Provider seam** — new `packages/ingest-core/src/provider/{types.ts,registry.ts}` (above).
4. **Move the engine** (`git mv`, subtrees intact — `#src/*` keeps resolving because core declares
   the same imports map): `types/`, `pipeline/`, `progress/`, `adapters/`, `strategies/`, `handlers/`,
   `payload/`, `bootstrap.ts` → `packages/ingest-core/src/`. Then move `pipeline/source.ts` back to
   `packages/ingest-github/src/source.ts` (GitHub-only clone primitive).
5. **Rewire the 7 boundary sites** in core's `pipeline/{run,branch,pull,pull-source-resolver}.ts`:
   - `parseGithubRepo(url)` → `provider.parse(url)`
   - `fetchLatestCommitHash(...)` / `fetchDefaultBranch(...)` → `provider.api.*`
   - `syncRepository(opts)` + `readHeadCommitHash(dir)` → `const sha = await provider.clone(opts)`
   - each resolves the provider via `resolveProvider(repoUrl, payload.provider)`; `resolveBranch`
     takes `provider.api`; `resolvePullSource` takes the provider.
   - switch engine type refs `GithubIndexPayload`→`RepoIndexPayload`, `GithubPullPayload`→`RepoPullPayload`.
   - keep the on-disk `RepoLocation.provider: "github"` segment (only host today; GitLab reuses it, as in the enterprise repo).
6. **Core `index.ts`** — export runner (`createPipelineRunner` + deps), `runPull`, `pickStrategy`,
   strategy factories, `createDiskSourceReader`, path helpers (`pathsFor`, `orgsRoot`, `ensureCommitDirs`,
   `metaRootFor`, `businessContextDir`, `orgRegistryDir`), engine types (`SourceReader`, `SourceFactory`,
   `PullFactory`, `IngestStrategy`, `PipelineSummary`, `DiffResult`, …), `bootstrapRuntime`, `reposRoot`,
   progress factories/types, the provider registry (`GitProvider`, `GitHostApi`, `ParsedRepo`, `CloneOptions`,
   `registerGitProvider`, `resolveProvider`, `listGitProviders`), and a new `registerIngestWorkers(deps?)`
   that merges today's `registerGithubWorkers` + `registerLocalIngestWorker` (registers `JobType.GithubIndex`,
   `GithubPull`, `LocalIngest`).
7. **`@bb/ingest-github` → GitHub provider** — keep `githubUrl.ts`, `githubApi.ts`, `githubCommit.ts`,
   `source.ts`; add `provider.ts` exporting `GitHubProvider` (`matches`=github.com; `parse`=parseGithubRepo;
   `api`=the fetch\* fns; `clone`=syncRepository+readHeadCommitHash). Rewrite `index.ts` to export
   `GitHubProvider` **and preserve** `fetchDefaultBranch`/`fetchBranches`/`fetchLatestCommitHash`/
   `fetchRecentCommits`/`parseGithubRepo` (+ `ParsedRepo`,`CommitEntry`,`FetchCommitsResult`,`DefaultBranchResult`).
   Add `@bb/ingest-core` dependency.
8. **`@bb/ingest-business-context`** — repoint `businessContextDir`/`metaRootFor`/`orgRegistryDir`
   imports (4 lines across `disk/save-analysis.ts`, `disk/save-original.ts`, `strategy/execute.ts`,
   `llm/enrichment-reader.ts`) from `@bb/ingest-github` → `@bb/ingest-core`; swap the dependency; update README.
9. **`@bb/server`** — `src/index.ts`: replace `registerGithubWorkers()` + `registerLocalIngestWorker()`
   with `registerGitProvider(GitHubProvider)` then `registerIngestWorkers()`; add `@bb/ingest-core` dep.
   The three `github*Route.ts` files keep importing `fetch*` from `@bb/ingest-github` unchanged.
10. **READMEs + final gates** — author `ingest-core/README.md`, refresh `ingest-github/README.md` and the
    moved subfolder READMEs; run `bun run typecheck` and `bun run lint` green.

## Blast radius (verified)

- External importers of `@bb/ingest-github`: business-context (path helpers → repoint), server's 3 routes
  (`fetch*` → stay), server `index.ts` (`register*` → becomes `registerIngestWorkers`). **CLI does not import it.**
- `bootstrapRuntime` and `reposRoot` have no external consumers — safe to move to core.
- GitHub↔engine coupling is exactly 7 import sites in 4 files.
- Root `tsconfig.json` uses `include` globs (no `references` array) — a new package is auto-included.

## Risks / guards

- **No cycle:** core must never import a provider package; only `@bb/server` imports both.
- **business-context** silently breaks unless its path-helper imports are repointed (step 8).
- **Behavior preserved:** no logic changes — relocation + payload-type neutralization + provider indirection only.
- **300-line rule:** all moved files already comply; new provider/registry files stay small.
- **README rule:** `ingest-core` + each touched folder must ship/refresh a README.

## Verification

- `bun run typecheck` + `bun run lint` green (after each step and at the end).
- `bytebell server` boots; `POST /api/v1/github/index` on a small public repo indexes end-to-end
  (clone → flat-folder → Mongo `raw` rows + Neo4j `:File` nodes) and reaches `PROCESSED` via `bytebell ls`.
- MCP `smart_search` / `retrieve_file` against the indexed repo return results.
- Diff sanity: `ingest-github` shrinks to URL/API/clone + provider glue; `ingest-core` holds strategies + runner.
