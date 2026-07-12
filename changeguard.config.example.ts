import { defineConfig } from "@changeguard/core";

/**
 * Example ChangeGuard AI configuration.
 * Copy to `changeguard.config.ts` (or run `changeguard init`) and edit.
 */
export default defineConfig({
  baseBranch: "main",

  include: ["apps/**", "packages/**"],

  exclude: ["**/generated/**", "**/*.snap", "**/dist/**"],

  sensitivePaths: [
    { pattern: "src/auth/**", risk: 20, category: "authentication" },
    { pattern: "prisma/migrations/**", risk: 15, category: "database" },
    { pattern: ".github/workflows/**", risk: 12, category: "ci" }
  ],

  tests: {
    sourcePatterns: ["src/**/*.ts"],
    testPatterns: ["tests/**/*.test.ts", "tests/**/*.spec.ts"]
  },

  risk: {
    warnThreshold: 40,
    failThreshold: 70
  },

  ai: {
    enabled: false,
    provider: "ollama",
    model: "qwen3:14b",
    maxFiles: 30,
    minimumConfidence: 0.7
  },

  output: {
    markdown: true,
    json: true,
    sarif: false
  }
});
