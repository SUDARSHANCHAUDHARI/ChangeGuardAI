import { describe, it, expect } from "vitest";
import { matchGlob } from "./glob.js";

describe("matchGlob", () => {
  it("matches * within a single segment only", () => {
    expect(matchGlob("src/*.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/sub/a.ts")).toBe(false);
  });

  it("matches ** across directories including trailing", () => {
    expect(matchGlob("apps/**", "apps/cli/src/index.ts")).toBe(true);
    expect(matchGlob("src/auth/**", "src/auth/session.ts")).toBe(true);
  });

  it("matches **/ with zero directories", () => {
    expect(matchGlob("**/*.snap", "a.snap")).toBe(true);
    expect(matchGlob("**/*.snap", "a/b/c.snap")).toBe(true);
  });

  it("matches a/**/b with and without middle dirs", () => {
    expect(matchGlob("a/**/b", "a/b")).toBe(true);
    expect(matchGlob("a/**/b", "a/x/y/b")).toBe(true);
    expect(matchGlob("a/**/b", "a/x/y/c")).toBe(false);
  });

  it("treats ? as a single non-slash char", () => {
    expect(matchGlob("v?.ts", "v1.ts")).toBe(true);
    expect(matchGlob("v?.ts", "v12.ts")).toBe(false);
  });

  it("escapes regex metacharacters in literals", () => {
    expect(matchGlob("a.b+c.ts", "a.b+c.ts")).toBe(true);
    expect(matchGlob("a.b+c.ts", "axbxc.ts")).toBe(false);
  });
});
