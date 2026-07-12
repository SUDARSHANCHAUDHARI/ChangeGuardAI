import { describe, it, expect } from "vitest";
import { fetchPullRequest } from "./pr.js";
import { GitHubTokenMissingError } from "../shared/errors.js";

describe("fetchPullRequest", () => {
  it("throws GitHubTokenMissingError when no token is provided", async () => {
    await expect(fetchPullRequest(undefined, { owner: "o", repo: "r", number: 1 })).rejects.toBeInstanceOf(
      GitHubTokenMissingError
    );
  });

  it("throws GitHubTokenMissingError for an empty token", async () => {
    await expect(fetchPullRequest("   ", { owner: "o", repo: "r", number: 1 })).rejects.toBeInstanceOf(
      GitHubTokenMissingError
    );
  });
});
