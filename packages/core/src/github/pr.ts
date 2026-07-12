import { Octokit } from "@octokit/rest";
import type { RawChangedFile } from "../git/diff-parser.js";
import type { ChangeStatus } from "../types/domain.js";
import { GitHubTokenMissingError, PullRequestNotFoundError } from "../shared/errors.js";

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PullRequestData {
  title: string;
  body: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  files: RawChangedFile[];
}

function mapStatus(status: string): ChangeStatus {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    case "copied":
      return "added";
    default:
      return "modified"; // modified, changed, unchanged
  }
}

/**
 * Read-only GitHub PR fetch. Reads PR metadata and its changed files (with
 * patches) via the REST API. This never writes to GitHub — no comments, labels,
 * or status checks. Requires a token with read access to the repository.
 */
export async function fetchPullRequest(token: string | undefined, ref: PullRequestRef): Promise<PullRequestData> {
  if (token === undefined || token.trim().length === 0) {
    throw new GitHubTokenMissingError();
  }
  const octokit = new Octokit({ auth: token });

  let pr;
  try {
    const res = await octokit.pulls.get({ owner: ref.owner, repo: ref.repo, pull_number: ref.number });
    pr = res.data;
  } catch (err) {
    throw new PullRequestNotFoundError(ref.number, err);
  }

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    per_page: 100
  });

  const changedFiles: RawChangedFile[] = files.map((f) => {
    const patch = f.patch ?? "";
    const file: RawChangedFile = {
      path: f.filename,
      status: mapStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
      patch,
      // The API omits `patch` for binary and very large files.
      binary: f.patch === undefined && f.changes === 0
    };
    if (f.previous_filename !== undefined) file.previousPath = f.previous_filename;
    return file;
  });

  return {
    title: pr.title ?? "",
    body: pr.body ?? "",
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    files: changedFiles
  };
}
