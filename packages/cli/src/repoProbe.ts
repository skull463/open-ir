// SPDX-License-Identifier: AGPL-3.0-only WITH non-commercial-clause
import { HttpClientError, postJson } from "./httpClient.ts";
import { error, info, list } from "./output.ts";
import { promptForToken } from "./pullPrompts.ts";
import { promptInitialBranch, promptFullBranchSelector } from "./branchPrompts.ts";
import { parseGithubRepo } from "@bb/ingest-github";

interface ProbeResponse {
  status: "ok" | "not_found" | "unauthorized" | "rate_limited" | "error" | "branch_not_found";
  defaultBranch?: string;
  branches?: string[];
  message?: string;
}

export interface ProbeResult {
  branch: string | null;
  token?: string;
}

// Resolve the branch + token to index a remote repo. Probes the server's
// `/api/v1/github/probe` route to discover the default branch / access status,
// prompts for a PAT when the repo is private, and (in a TTY) lets the user pick
// a branch. `branch === null` means the user cancelled or the probe failed —
// callers must not proceed to index. Requires the server to be running.
export async function probeRepo(gitUrl: string, suppliedBranch?: string, suppliedToken?: string): Promise<ProbeResult> {
  let token = suppliedToken;
  const parsed = parseGithubRepo(gitUrl);
  const repoLabel = parsed ? `${parsed.owner}/${parsed.repo}` : gitUrl;

  // 1. Initial probe to find default branch and check access
  const callProbe = async (t?: string): Promise<ProbeResponse> => {
    try {
      return await postJson<ProbeResponse>("/api/v1/github/probe", { repoUrl: gitUrl, gitToken: t });
    } catch (cause) {
      if (cause instanceof HttpClientError && (cause.status === 401 || cause.status === 404)) {
        return (cause.body as ProbeResponse) || { status: cause.status === 404 ? "not_found" : "unauthorized" };
      }
      throw cause;
    }
  };

  let probe = await callProbe(token);

  // 2. Handle private repo if needed
  if (probe.status === "not_found" || probe.status === "unauthorized") {
    const promptMessage =
      probe.status === "unauthorized"
        ? "The previous token was rejected. Try a different PAT."
        : "This repo looks private. Paste a GitHub PAT with `repo` scope.";
    const tokenResult = await promptForToken(repoLabel, promptMessage);
    if (tokenResult === null) {
      info("Cancelled.");
      return { branch: null };
    }
    token = tokenResult;
    probe = await callProbe(token);
  }

  if (probe.status !== "ok") {
    error(probe.message ?? "Failed to probe repository.");
    return { branch: null };
  }

  // 3. If a branch was already supplied (via flag or URL), just verify it
  const branchFromUrl = parsed?.branch;
  const initialBranch = suppliedBranch ?? branchFromUrl;
  if (initialBranch !== undefined) {
    if (probe.branches && !probe.branches.includes(initialBranch)) {
      error(`Branch '${initialBranch}' not found.`);
      if (probe.branches.length > 0) {
        list("Available branches:", probe.branches.slice(0, 20));
      }
      return { branch: null };
    }
    const res: ProbeResult = { branch: initialBranch };
    if (token) {
      res.token = token;
    }
    return res;
  }

  // 4. Interactive menu flow — skip when stdin is not a TTY (e.g. install script)
  if (process.stdin.isTTY !== true) {
    const defaultBranch = probe.defaultBranch ?? "main";
    const res: ProbeResult = { branch: defaultBranch };
    if (token) {
      res.token = token;
    }
    return res;
  }

  const defaultBranch = probe.defaultBranch ?? "main";
  const choice = await promptInitialBranch(defaultBranch);
  if (choice === null) {
    info("Cancelled.");
    return { branch: null };
  }

  if (choice === "default") {
    const res: ProbeResult = { branch: defaultBranch };
    if (token) {
      res.token = token;
    }
    return res;
  }

  // User selected "Other branch..."
  const fullSelection = await promptFullBranchSelector(probe.branches ?? []);
  if (fullSelection === null) {
    info("Cancelled.");
    return { branch: null };
  }

  const res: ProbeResult = { branch: fullSelection.branch };
  if (token) {
    res.token = token;
  }
  return res;
}
