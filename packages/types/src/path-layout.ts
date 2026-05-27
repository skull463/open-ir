import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Pure-typed on-disk path resolver shared across packages that need to read
// or write knowledge artifacts. No I/O, no FS calls — every helper returns
// strings derived from the inputs. Callers compose with their own
// `getBytebellHome()` (the package boundary that holds the home-dir state).
//
// Layout (per knowledge + provider + commit):
//   `<home>/orgs/<orgId>/<provider>/<knowledgeId>/<owner>/<repo>/<commit>/repository/`
//   `<home>/orgs/<orgId>/<provider>/<knowledgeId>/<owner>/<repo>/<commit>/meta-output/`
// For local sources the `<owner>/<repo>` segments collapse:
//   `<home>/orgs/<orgId>/local/<knowledgeId>/<commit>/repository/`
//
// See `@bb/ingest-github/src/pipeline/paths.ts` for the I/O-aware wrappers
// that pair with this module.
// ─────────────────────────────────────────────────────────────────────────────

export type RepoLocation =
  | {
      provider: "github";
      orgId: string;
      knowledgeId: string;
      owner: string;
      repo: string;
      commitHash: string;
    }
  | {
      provider: "local";
      orgId: string;
      knowledgeId: string;
      commitHash: string;
    };

/**
 * Same `MetaPaths` shape that `@bb/ingest-github` exposes — duplicated here
 * so kernel-tier consumers can describe the surface without taking a Domain
 * dependency. Field semantics: see `@bb/ingest-github/types/meta-paths.ts`.
 */
export interface MetaPathsLayout {
  repositoryDir: string;
  metaOutputRoot: string;
  metaRoot: string;
  fileAnalysisDir: string;
  folderSummariesDir: string;
  bigFileAnalysisDir: string;
  bigFileChunksDir: string;
  bigFilesJson: string;
  scanManifestJson: string;
  repoSummaryJson: string;
}

export function orgsRootFor(home: string): string {
  return path.join(home, "orgs");
}

export function commitBaseDirFor(home: string, loc: RepoLocation): string {
  if (loc.provider === "github") {
    return path.join(orgsRootFor(home), loc.orgId, "github", loc.knowledgeId, loc.owner, loc.repo, loc.commitHash);
  }
  return path.join(orgsRootFor(home), loc.orgId, "local", loc.knowledgeId, loc.commitHash);
}

export function repositoryDirFor(home: string, loc: RepoLocation): string {
  return path.join(commitBaseDirFor(home, loc), "repository");
}

export function metaOutputRootFor(home: string, loc: RepoLocation): string {
  return path.join(commitBaseDirFor(home, loc), "meta-output");
}

export function bytebellPathsFor(home: string, loc: RepoLocation): MetaPathsLayout {
  const meta = metaOutputRootFor(home, loc);
  return {
    repositoryDir: repositoryDirFor(home, loc),
    metaOutputRoot: meta,
    metaRoot: meta,
    fileAnalysisDir: path.join(meta, "file-analysis"),
    folderSummariesDir: path.join(meta, "folder-summaries"),
    bigFileAnalysisDir: path.join(meta, "big-file-analysis"),
    bigFileChunksDir: path.join(meta, "big-file-analysis", "chunks"),
    bigFilesJson: path.join(meta, "bigFiles.json"),
    scanManifestJson: path.join(meta, "scan-manifest.json"),
    repoSummaryJson: path.join(meta, "repo-summary.json"),
  };
}

/**
 * Pure URL parser for GitHub repo URLs. Extracts owner and repo segments,
 * tolerating `.git` suffixes and `tree/branch` paths. Returns `null` on any
 * input that isn't a GitHub-hosted URL.
 *
 * Duplicates the public `parseGithubRepo` from `@bb/ingest-github/githubUrl`
 * deliberately — kernel-tier code can't import from Domain. The two
 * implementations must stay consistent; both are tiny and pure.
 */
export function parseGithubOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  if (repoUrl.length === 0) {
    return null;
  }
  try {
    const url = new URL(repoUrl);
    if (!url.hostname.endsWith("github.com")) {
      return null;
    }
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length < 2) {
      return null;
    }
    const owner = segments[0];
    const repoRaw = segments[1];
    if (owner === undefined || repoRaw === undefined) {
      return null;
    }
    return { owner, repo: repoRaw.replace(/\.git$/u, "") };
  } catch {
    return null;
  }
}
