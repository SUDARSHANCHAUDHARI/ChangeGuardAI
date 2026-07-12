import { describe, it, expect } from "vitest";
import { extractJsonObject } from "./json.js";
import { buildChangeContext } from "./context-builder.js";
import { createProvider } from "./create.js";
import { aiAnalysisResponseSchema } from "./types.js";
import { configSchema } from "../config/schema.js";
import { InvalidConfigurationError } from "../shared/errors.js";
import type { ChangedFile, RepositoryInfo } from "../types/domain.js";

const repository: RepositoryInfo = {
  root: "/repo",
  baseBranch: "main",
  languages: ["typescript"],
  frameworks: [],
  testFrameworks: [],
  monorepo: false,
  databaseTools: [],
  apiFrameworks: ["express"],
  ciConfigured: false
};

describe("extractJsonObject", () => {
  it("pulls a JSON object out of fenced prose", () => {
    const text = 'Sure!\n```json\n{"findings":[]}\n```\nDone.';
    expect(extractJsonObject(text)).toBe('{"findings":[]}');
  });
  it("handles braces inside strings", () => {
    const text = '{"a":"has } brace","b":1}';
    expect(extractJsonObject(text)).toBe(text);
  });
  it("returns undefined when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeUndefined();
  });
});

describe("buildChangeContext", () => {
  const files: ChangedFile[] = [
    {
      path: "src/routes/users.ts",
      status: "modified",
      additions: 2,
      deletions: 0,
      patch: "@@ -1 +1,3 @@\n+app.get('/u', h);\n+app.post('/u', h);",
      binary: false,
      category: "api"
    },
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-authorize()\n+// removed",
      binary: false,
      category: "authentication"
    }
  ];

  it("ranks sensitive categories first and respects the file limit", () => {
    const ctx = buildChangeContext({
      changedFiles: files,
      deterministicFindings: [],
      repository,
      limits: { maxFiles: 1, maxContextChars: 10000 }
    });
    expect(ctx.files).toHaveLength(1);
    expect(ctx.files[0]?.path).toBe("src/auth/session.ts"); // auth outranks api
  });

  it("excludes binary and empty-patch files", () => {
    const ctx = buildChangeContext({
      changedFiles: [
        ...files,
        { path: "logo.png", status: "added", additions: 0, deletions: 0, patch: "", binary: true, category: "generated" }
      ],
      deterministicFindings: [],
      repository,
      limits: { maxFiles: 10, maxContextChars: 10000 }
    });
    expect(ctx.files.map((f) => f.path)).not.toContain("logo.png");
  });
});

describe("createProvider", () => {
  it("builds a mock provider without a model", () => {
    const cfg = configSchema.parse({ ai: { provider: "mock" } });
    expect(createProvider(cfg, {}).name).toBe("mock");
  });

  it("requires a model for ollama/openai", () => {
    const cfg = configSchema.parse({ ai: { provider: "ollama" } });
    expect(() => createProvider(cfg, {})).toThrow(InvalidConfigurationError);
  });

  it("honors environment overrides", () => {
    const cfg = configSchema.parse({ ai: { provider: "ollama", model: "x" } });
    const p = createProvider(cfg, { CHANGEGUARD_PROVIDER: "openai", CHANGEGUARD_MODEL: "gpt-x" });
    expect(p.name).toBe("openai");
  });
});

describe("aiAnalysisResponseSchema", () => {
  it("defaults missing findings to an empty array", () => {
    expect(aiAnalysisResponseSchema.parse({}).findings).toEqual([]);
  });
  it("rejects an invalid severity", () => {
    const res = aiAnalysisResponseSchema.safeParse({
      findings: [{ title: "t", severity: "bad", category: "security", file: "a", evidence: "e", confidence: 0.5 }]
    });
    expect(res.success).toBe(false);
  });
});
