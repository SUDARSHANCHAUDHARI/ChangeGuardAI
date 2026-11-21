import { describe, it, expect } from "vitest";
import { collectDiff } from "./sources.js";
import { BaseBranchMissingError } from "../shared/errors.js";
import type { Git } from "./git.js";

function fakeGit(): { git: Git; calls: string[][] } {
  const calls: string[][] = [];
  const git = {
    run: async (args: string[]) => {
      calls.push(args);
      return "";
    },
    refExists: async () => true
  } as unknown as Git;
  return { git, calls };
}

describe("collectDiff commit ranges", () => {
  it("rejects a range starting with a dash before running git", async () => {
    const { git, calls } = fakeGit();
    await expect(collectDiff(git, { kind: "commits", range: "--output=/tmp/pwned" })).rejects.toThrow(
      BaseBranchMissingError
    );
    expect(calls).toEqual([]);
  });

  it("passes an ordinary range through to git", async () => {
    const { git, calls } = fakeGit();
    await collectDiff(git, { kind: "commits", range: "HEAD~2..HEAD" });
    expect(calls.length).toBe(3);
    for (const args of calls) expect(args).toContain("HEAD~2..HEAD");
  });
});
