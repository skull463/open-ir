import type { GithubPullPayload, JobMessage } from "@bb/types";
import { IngestError } from "@bb/errors";
import { logger } from "@bb/logger";
import { ensureReposRoot, repoCloneDir } from "./paths.ts";
import { readHeadCommitHash, syncRepository } from "./source.ts";
import { assertReachableFromBranch, checkoutCommit, emptyDiff, type DiffResult } from "./git-diff.ts";
import { computePullDiff, materialiseEndpoints } from "./pull-diff-resolver.ts";
import { createDiskSourceReader } from "./disk-source-reader.ts";
import type { SourceReader } from "#src/types/pipeline.ts";

export interface ResolvedPullSource {
  source: SourceReader;
  diff: DiffResult;
  targetCommit: string;
  /** True when the resolved target equals the previously-indexed commit. Caller short-circuits to a no-op. */
  noOp: boolean;
}

export interface ResolveDiskInput {
  msg: JobMessage<GithubPullPayload>;
  knowledgeId: string;
  repoUrl: string;
  branch: string;
  currentCommit: string;
  gitToken?: string;
}

/**
 * Disk-backed fallback that runs when no `PullFactory` is supplied. Clones (or
 * fetch+resets) the repo, resolves the target commit, deepens the shallow
 * clone to make non-HEAD targets reachable, asserts branch ancestry,
 * computes the diff, and checks out the target. Returns `noOp: true` when
 * the target matches the previously-indexed commit so the caller can
 * transition to PROCESSED without further work.
 */
export async function resolvePullSourceFromDisk(input: ResolveDiskInput): Promise<ResolvedPullSource> {
  const { knowledgeId, repoUrl, branch, currentCommit, gitToken } = input;
  await ensureReposRoot();
  const repoDir = repoCloneDir(knowledgeId);
  const cloneOpts: { repoUrl: string; branch: string; destinationDir: string; gitToken?: string } = {
    repoUrl,
    branch,
    destinationDir: repoDir,
  };
  if (gitToken !== undefined) {
    cloneOpts.gitToken = gitToken;
  }
  await syncRepository(cloneOpts);

  const branchHead = await readHeadCommitHash(repoDir);
  if (branchHead === "unknown") {
    throw new IngestError(knowledgeId, "could not resolve branch HEAD after clone");
  }
  const targetCommit = input.msg.payload.targetCommitHash ?? branchHead;

  if (targetCommit === currentCommit) {
    logger.info(`pull: ${knowledgeId} already at ${targetCommit.slice(0, 12)}; no-op`);
    return {
      source: createDiskSourceReader({ repoDir, commitHash: targetCommit }),
      diff: emptyDiff(),
      targetCommit,
      noOp: true,
    };
  }

  // Deepen the shallow clone first so historical commits selected via the
  // picker become visible to `merge-base --is-ancestor`. Without this the
  // assertion below rejects every non-HEAD pick on a `--depth=1` clone.
  await materialiseEndpoints(repoDir, branch, currentCommit, targetCommit);

  if (!(await assertReachableFromBranch(repoDir, targetCommit, branch))) {
    throw new IngestError(
      knowledgeId,
      `target commit ${targetCommit} is not reachable from origin/${branch}. Cross-branch pulls are not supported; create a fresh github_index job for the new branch.`,
    );
  }

  const diff = await computePullDiff(repoDir, currentCommit, targetCommit);
  await checkoutCommit(repoDir, targetCommit);
  const source = createDiskSourceReader({ repoDir, commitHash: targetCommit });
  return { source, diff, targetCommit, noOp: false };
}
