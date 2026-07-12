import { describe, it, expect } from "vitest";
import { classifyFile, detectLanguage } from "./classify.js";

describe("classifyFile", () => {
  const cases: Array<[string, string]> = [
    ["src/auth/session.ts", "authentication"],
    ["src/permissions/roles.ts", "authorization"],
    ["src/routes/users.ts", "api"],
    ["src/controllers/users.ts", "api"],
    ["prisma/migrations/001_init/migration.sql", "migration"],
    ["db/migrate/002_add.sql", "migration"],
    ["prisma/schema.prisma", "database"],
    ["package.json", "dependency"],
    ["pnpm-lock.yaml", "dependency"],
    [".github/workflows/ci.yml", "ci"],
    ["Dockerfile", "infrastructure"],
    ["docker-compose.yml", "infrastructure"],
    ["src/user.test.ts", "test"],
    ["src/user.spec.ts", "test"],
    ["tests/e2e/login.ts", "test"],
    ["docs/architecture.md", "documentation"],
    ["dist/index.js", "generated"],
    ["src/util/math.ts", "source"],
    ["config/app.yaml", "configuration"],
    ["some/weird/file.xyz", "unknown"]
  ];

  for (const [path, expected] of cases) {
    it(`classifies ${path} as ${expected}`, () => {
      expect(classifyFile(path)).toBe(expected);
    });
  }

  it("applies user overrides first", () => {
    expect(classifyFile("src/util/math.ts", [{ pattern: "src/util/**", category: "database" }])).toBe(
      "database"
    );
  });
});

describe("detectLanguage", () => {
  it("maps known extensions", () => {
    expect(detectLanguage("a/b.ts")).toBe("typescript");
    expect(detectLanguage("a/b.py")).toBe("python");
    expect(detectLanguage("a/b.go")).toBe("go");
  });
  it("returns undefined for unknown or extensionless", () => {
    expect(detectLanguage("Makefile")).toBeUndefined();
    expect(detectLanguage("a/b.xyz")).toBeUndefined();
  });
});
