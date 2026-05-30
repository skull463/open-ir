import path from "node:path";
import { stat, rename, mkdir, readdir, rm, cp } from "node:fs/promises";
import { Command } from "commander";
import {
  bytebellPathsFor,
  Config,
  commitBaseDirFor,
  parseGithubOwnerRepo,
  repositoryDirFor,
  type RepoLocation,
} from "@bb/types";
import { getBytebellHome, getConfigValue } from "@bb/config";
import { connectMongo, closeMongo, listKnowledge } from "@bb/mongo";
import { error, success } from "./output.ts";

// ─────────────────────────────────────────────────────────────────────────────
// `bytebell migrate paths`
//
// One-shot migration from the legacy on-disk layout
// (`<home>/repos/<knowledgeId>/` for clones, `<home>/repos/.meta/<knowledgeId>/...`
// for meta) to the commit-scoped layout
// (`<home>/orgs/<orgId>/<provider>/<knowledgeId>/<owner>/<repo>/<commit>/...`).
//
// For each `KnowledgeDoc` in Mongo:
//   1. Derive `RepoLocation` from `source` + `info.repoUrl`.
//   2. Compute legacy paths (clone + meta).
//   3. Move them under the new commit-scoped tree.
//   4. Record migrated / skipped / failed in a summary.
//
// Skips knowledges that lack `source.commitId` or `info.repoUrl` — those
// predate commit tracking and have no unambiguous target. The operator can
// `bytebell delete` them or re-index from scratch.
// ─────────────────────────────────────────────────────────────────────────────

export function buildMigrateCommand(): Command {
  const cmd = new Command("migrate");
  cmd.description("One-off migrations between on-disk layouts.");

  cmd
    .command("paths")
    .description("Move the legacy `repos/.meta/<id>/` tree under the commit-scoped `orgs/<orgId>/<provider>/...` tree.")
    .option("--dry-run", "Print what would change without touching disk.")
    .action(async (opts: { dryRun?: boolean }) => {
      const dryRun = opts.dryRun === true;
      try {
        await runPathsMigration({ dryRun });
      } catch (cause: unknown) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        error(`paths migration failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  return cmd;
}

interface Summary {
  migrated: string[];
  skippedNoCommit: string[];
  skippedNoRepoUrl: string[];
  skippedAlready: string[];
  failed: Array<{ knowledgeId: string; reason: string }>;
}

async function runPathsMigration(opts: { dryRun: boolean }): Promise<void> {
  await connectMongo();
  try {
    const home = getBytebellHome();
    const orgId = getConfigValue(Config.OrgId);
    const entries = await listKnowledge({ limit: 10_000 });
    const summary: Summary = {
      migrated: [],
      skippedNoCommit: [],
      skippedNoRepoUrl: [],
      skippedAlready: [],
      failed: [],
    };
    for (const k of entries) {
      try {
        await migrateOne({ home, orgId, knowledgeId: k.knowledgeId, doc: k, dryRun: opts.dryRun, summary });
      } catch (cause: unknown) {
        summary.failed.push({
          knowledgeId: k.knowledgeId,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    printSummary(summary, opts.dryRun);
  } finally {
    await closeMongo();
  }
}

interface MigrateOneInput {
  home: string;
  orgId: string;
  knowledgeId: string;
  doc: Awaited<ReturnType<typeof listKnowledge>>[number];
  dryRun: boolean;
  summary: Summary;
}

async function migrateOne(input: MigrateOneInput): Promise<void> {
  const { home, orgId, knowledgeId, doc, dryRun, summary } = input;
  const legacyCloneDir = path.join(home, "repos", knowledgeId);
  const legacyMetaRoot = path.join(home, "repos", ".meta", knowledgeId);

  if (doc.source.kind === "local") {
    // Local sources never had a managed clone — the worker reads from
    // `source.sourcePath` directly. Only meta-output needs migrating, under a
    // synthetic commit hash. We can't reconstruct the original synthetic
    // commit if multiple runs happened; pick the latest by `updatedAt`.
    const syntheticCommit = `migrated-${doc.updatedAt.getTime()}`;
    const newLoc: RepoLocation = { provider: "local", orgId, knowledgeId, commitHash: syntheticCommit };
    await moveMetaIfPresent({ legacyMetaRoot, newLoc, home, dryRun, knowledgeId, summary });
    return;
  }

  const commitId = doc.source.commitId;
  if (commitId === undefined || commitId.length === 0) {
    summary.skippedNoCommit.push(knowledgeId);
    return;
  }
  const repoUrl = doc.info.repoUrl;
  if (repoUrl === undefined || repoUrl.length === 0) {
    summary.skippedNoRepoUrl.push(knowledgeId);
    return;
  }
  const parsed = parseGithubOwnerRepo(repoUrl);
  if (parsed === null) {
    summary.failed.push({ knowledgeId, reason: `could not parse owner/repo from ${repoUrl}` });
    return;
  }
  const newLoc: RepoLocation = {
    provider: "github",
    orgId,
    knowledgeId,
    owner: parsed.owner,
    repo: parsed.repo,
    commitHash: commitId,
  };

  // Both meta and clone need migrating for github sources.
  await moveCloneIfPresent({ legacyCloneDir, newLoc, home, dryRun, knowledgeId, summary });
  await moveMetaIfPresent({ legacyMetaRoot, newLoc, home, dryRun, knowledgeId, summary });
}

interface MoveCloneInput {
  legacyCloneDir: string;
  newLoc: RepoLocation;
  home: string;
  dryRun: boolean;
  knowledgeId: string;
  summary: Summary;
}

async function moveCloneIfPresent(input: MoveCloneInput): Promise<void> {
  if (!(await pathExists(input.legacyCloneDir))) {
    return;
  }
  const newCloneDir = repositoryDirFor(input.home, input.newLoc);
  if (await pathExists(newCloneDir)) {
    input.summary.skippedAlready.push(`${input.knowledgeId} (clone)`);
    return;
  }
  if (input.dryRun) {
    success(`[dry-run] mv ${input.legacyCloneDir} -> ${newCloneDir}`);
  } else {
    await mkdir(path.dirname(newCloneDir), { recursive: true, mode: 0o700 });
    await renameOrCopy(input.legacyCloneDir, newCloneDir);
  }
  input.summary.migrated.push(`${input.knowledgeId} (clone)`);
}

interface MoveMetaInput {
  legacyMetaRoot: string;
  newLoc: RepoLocation;
  home: string;
  dryRun: boolean;
  knowledgeId: string;
  summary: Summary;
}

async function moveMetaIfPresent(input: MoveMetaInput): Promise<void> {
  if (!(await pathExists(input.legacyMetaRoot))) {
    return;
  }
  const newMetaOutput = bytebellPathsFor(input.home, input.newLoc).metaOutputRoot;
  if (await pathExists(newMetaOutput)) {
    input.summary.skippedAlready.push(`${input.knowledgeId} (meta-output)`);
    return;
  }
  if (input.dryRun) {
    success(`[dry-run] mv ${input.legacyMetaRoot} -> ${newMetaOutput}`);
  } else {
    await mkdir(path.dirname(newMetaOutput), { recursive: true, mode: 0o700 });
    await renameOrCopy(input.legacyMetaRoot, newMetaOutput);
    // Bonus: pull commits/<commitHash>/business-context/ contents UP into
    // meta-output/business-context/ for the new layout's expectation.
    await flattenLegacyBusinessContext(newMetaOutput, input.newLoc);
  }
  input.summary.migrated.push(`${input.knowledgeId} (meta-output)`);
  // Hint that the kube-v2 commit dir is now visible.
  const base = commitBaseDirFor(input.home, input.newLoc);
  success(`  → ${base}`);
}

async function flattenLegacyBusinessContext(metaOutputRoot: string, loc: RepoLocation): Promise<void> {
  // Legacy: metaOutputRoot/commits/<commitHash>/business-context/<title>/...
  // New:    metaOutputRoot/business-context/<title>/...
  // We only flatten contexts authored against the current head commit; older
  // commits stay nested for forensic access.
  const commitsDir = path.join(metaOutputRoot, "commits");
  if (!(await pathExists(commitsDir))) {
    return;
  }
  const currentCommitBcDir = path.join(commitsDir, loc.commitHash, "business-context");
  if (!(await pathExists(currentCommitBcDir))) {
    return;
  }
  const targetBcDir = path.join(metaOutputRoot, "business-context");
  await mkdir(targetBcDir, { recursive: true, mode: 0o700 });
  const titles = await readdir(currentCommitBcDir);
  for (const title of titles) {
    const src = path.join(currentCommitBcDir, title);
    const dst = path.join(targetBcDir, title);
    if (await pathExists(dst)) {
      continue;
    }
    await renameOrCopy(src, dst);
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function renameOrCopy(src: string, dst: string): Promise<void> {
  try {
    await rename(src, dst);
  } catch (cause: unknown) {
    // Cross-device rename failure (EXDEV) — fall back to recursive copy + remove.
    if (cause instanceof Error && "code" in cause && (cause as { code?: unknown }).code === "EXDEV") {
      await cp(src, dst, { recursive: true });
      await rm(src, { recursive: true, force: true });
      return;
    }
    throw cause;
  }
}

function printSummary(summary: Summary, dryRun: boolean): void {
  const tag = dryRun ? "[dry-run] " : "";
  success(`${tag}migrated: ${summary.migrated.length}`);
  for (const m of summary.migrated) {
    success(`  ${m}`);
  }
  if (summary.skippedAlready.length > 0) {
    success(`${tag}skipped (already in new layout): ${summary.skippedAlready.length}`);
    for (const s of summary.skippedAlready) {
      success(`  ${s}`);
    }
  }
  if (summary.skippedNoCommit.length > 0) {
    error(`skipped (no commitId; predate commit tracking): ${summary.skippedNoCommit.length}`);
    for (const s of summary.skippedNoCommit) {
      error(`  ${s}`);
    }
  }
  if (summary.skippedNoRepoUrl.length > 0) {
    error(`skipped (no info.repoUrl): ${summary.skippedNoRepoUrl.length}`);
    for (const s of summary.skippedNoRepoUrl) {
      error(`  ${s}`);
    }
  }
  if (summary.failed.length > 0) {
    error(`failed: ${summary.failed.length}`);
    for (const f of summary.failed) {
      error(`  ${f.knowledgeId}: ${f.reason}`);
    }
    process.exitCode = 1;
  }
}
