import type { FileCategory } from "../types/domain.js";
import { matchGlob } from "../shared/glob.js";

/** A user-supplied classification override (from config). */
export interface ClassificationOverride {
  pattern: string;
  category: FileCategory;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  swift: "swift",
  sql: "sql",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  toml: "toml",
  md: "markdown"
};

export function detectLanguage(path: string): string | undefined {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext];
}

/**
 * Ordered classification rules. First match wins, so the most specific and
 * highest-signal patterns come first (test detection precedes source, security
 * dirs precede generic source, etc.).
 *
 * Each entry documents its own reasoning where non-obvious. These are path
 * heuristics only — they do not read file contents.
 */
const RULES: Array<{ test: (p: string, lower: string, base: string) => boolean; category: FileCategory }> = [
  // Generated / vendored — checked early so lockfiles don't count as "source".
  { test: (_p, l) => /(^|\/)dist\//.test(l) || /(^|\/)build\//.test(l), category: "generated" },
  { test: (_p, l) => /\.min\.(js|css)$/.test(l) || l.endsWith(".snap"), category: "generated" },
  { test: (_p, l) => /(^|\/)node_modules\//.test(l) || /(^|\/)vendor\//.test(l), category: "generated" },

  // Tests.
  {
    test: (_p, l, b) =>
      /\.(test|spec)\.[jt]sx?$/.test(b) ||
      /(^|\/)(tests?|__tests__|e2e)\//.test(l) ||
      /_test\.(go|py|rb)$/.test(b) ||
      /test_.*\.py$/.test(b),
    category: "test"
  },

  // CI.
  { test: (_p, l) => /(^|\/)\.github\/workflows\//.test(l) || /(^|\/)\.gitlab-ci\.yml$/.test(l), category: "ci" },
  {
    test: (_p, l, b) => b === "azure-pipelines.yml" || /(^|\/)\.circleci\//.test(l) || /(^|\/)\.buildkite\//.test(l),
    category: "ci"
  },

  // Infrastructure.
  {
    test: (_p, l, b) =>
      b === "dockerfile" ||
      b.endsWith(".dockerfile") ||
      /docker-compose(\.[\w-]+)?\.ya?ml$/.test(b) ||
      b.endsWith(".tf") ||
      /(^|\/)(k8s|kubernetes|helm|terraform)\//.test(l) ||
      /\.ya?ml$/.test(b) && /(^|\/)(deploy|manifests)\//.test(l),
    category: "infrastructure"
  },

  // Database migrations (before generic database).
  {
    test: (_p, l) =>
      /(^|\/)migrations?\//.test(l) ||
      /(^|\/)prisma\/migrations\//.test(l) ||
      /(^|\/)db\/migrate\//.test(l),
    category: "migration"
  },

  // Database (schemas, ORM models, raw SQL).
  {
    test: (_p, l, b) =>
      b === "schema.prisma" ||
      l.endsWith(".sql") ||
      /(^|\/)(models?|entities|schema|db|database)\//.test(l),
    category: "database"
  },

  // Dependencies / lockfiles.
  {
    test: (_p, _l, b) =>
      b === "package.json" ||
      b === "pnpm-lock.yaml" ||
      b === "package-lock.json" ||
      b === "yarn.lock" ||
      b === "go.mod" ||
      b === "go.sum" ||
      b === "cargo.toml" ||
      b === "cargo.lock" ||
      b === "requirements.txt" ||
      b === "pyproject.toml" ||
      b === "pom.xml" ||
      b === "build.gradle" ||
      b === "build.gradle.kts",
    category: "dependency"
  },

  // Authentication.
  {
    test: (_p, l) => /(^|\/)(auth|authentication|login|session|oauth|jwt)\b/.test(l) || /(^|\/)auth\//.test(l),
    category: "authentication"
  },

  // Authorization.
  {
    test: (_p, l) =>
      /(^|\/)(authz|authorization|permissions?|roles?|rbac|policy|policies|acl)\b/.test(l),
    category: "authorization"
  },

  // API (routes, controllers, handlers, resolvers, endpoints).
  {
    test: (_p, l) =>
      /(^|\/)(routes?|controllers?|handlers?|resolvers?|endpoints?|api|graphql)\//.test(l) ||
      /\.(controller|route|handler|resolver)\.[jt]sx?$/.test(l),
    category: "api"
  },

  // Documentation.
  {
    test: (_p, l, b) => /(^|\/)docs?\//.test(l) || b === "readme.md" || b === "changelog.md" || b.endsWith(".mdx"),
    category: "documentation"
  },

  // Configuration (broad — checked late so specific configs win first).
  {
    test: (_p, l, b) =>
      /\.(env|ini|conf|config|properties)$/.test(b) ||
      /\.(ya?ml|toml)$/.test(b) ||
      /(^|\/)config\//.test(l) ||
      /\.config\.[jt]s$/.test(b) ||
      b === ".env" ||
      b.startsWith(".env."),
    category: "configuration"
  }
];

const SOURCE_EXTS = new Set([
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "rb",
  "php",
  "cs",
  "swift"
]);

/**
 * Classify a file path into a FileCategory.
 *
 * @param path repo-relative path
 * @param overrides user config overrides, checked first (first match wins)
 */
export function classifyFile(path: string, overrides: ClassificationOverride[] = []): FileCategory {
  const normalized = path.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const base = (lower.split("/").pop() ?? lower).toLowerCase();

  for (const o of overrides) {
    if (matchGlob(o.pattern, normalized)) return o.category;
  }

  for (const rule of RULES) {
    if (rule.test(normalized, lower, base)) return rule.category;
  }

  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? "" : base.slice(dot + 1);
  if (SOURCE_EXTS.has(ext)) return "source";

  return "unknown";
}
