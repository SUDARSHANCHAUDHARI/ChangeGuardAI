import { describe, it, expect } from "vitest";
import { parseNameStatus, parseNumStat, splitUnifiedDiff } from "./diff-parser.js";

describe("parseNameStatus", () => {
  it("parses added, modified, deleted", () => {
    const z = ["A", "src/new.ts", "M", "src/edit.ts", "D", "src/gone.ts", ""].join("\0");
    const out = parseNameStatus(z);
    expect(out).toEqual([
      { status: "added", path: "src/new.ts" },
      { status: "modified", path: "src/edit.ts" },
      { status: "deleted", path: "src/gone.ts" }
    ]);
  });

  it("parses renames with old and new paths", () => {
    const z = ["R100", "src/old name.ts", "src/new name.ts", ""].join("\0");
    const out = parseNameStatus(z);
    expect(out).toEqual([
      { status: "renamed", path: "src/new name.ts", previousPath: "src/old name.ts" }
    ]);
  });

  it("handles empty input", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("parseNumStat", () => {
  it("parses normal records", () => {
    const z = "10\t3\tsrc/a.ts\0";
    const map = parseNumStat(z);
    expect(map.get("src/a.ts")).toEqual({ path: "src/a.ts", additions: 10, deletions: 3, binary: false });
  });

  it("flags binary files", () => {
    const z = "-\t-\tassets/logo.png\0";
    const map = parseNumStat(z);
    expect(map.get("assets/logo.png")).toEqual({
      path: "assets/logo.png",
      additions: 0,
      deletions: 0,
      binary: true
    });
  });

  it("parses rename records keyed by new path", () => {
    // add\tdel\t (empty inline path) then old, then new
    const z = "5\t2\t\0src/old.ts\0src/new.ts\0";
    const map = parseNumStat(z);
    expect(map.get("src/new.ts")).toEqual({
      path: "src/new.ts",
      additions: 5,
      deletions: 2,
      binary: false
    });
    expect(map.has("src/old.ts")).toBe(false);
  });
});

describe("splitUnifiedDiff", () => {
  const diff = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-const x = 1;
+const x = 2;
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1 @@
+export const y = 3;
`;

  it("splits into per-file chunks keyed by post-image path", () => {
    const chunks = splitUnifiedDiff(diff);
    expect([...chunks.keys()].sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(chunks.get("src/a.ts")).toContain("+const x = 2;");
    expect(chunks.get("src/b.ts")).toContain("+export const y = 3;");
  });

  it("keys deleted files by pre-image path", () => {
    const del = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const gone = true;
`;
    const chunks = splitUnifiedDiff(del);
    expect([...chunks.keys()]).toEqual(["src/gone.ts"]);
  });

  it("returns empty map for empty diff", () => {
    expect(splitUnifiedDiff("").size).toBe(0);
  });
});
