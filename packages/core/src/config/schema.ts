import { z } from "zod";
import { fileCategorySchema } from "../types/schemas.js";

/**
 * Config schema. Every field is optional with a sensible default so a project
 * can start with an empty `defineConfig({})`. Validation errors are surfaced as
 * InvalidConfigurationError (exit code 4).
 */
export const sensitivePathSchema = z.object({
  pattern: z.string().min(1),
  risk: z.number().min(0).max(100).default(0),
  category: fileCategorySchema.optional()
});

export const configSchema = z.object({
  baseBranch: z.string().min(1).default("main"),

  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),

  sensitivePaths: z.array(sensitivePathSchema).default([]),

  /** Classification overrides: force a path pattern into a category. */
  classify: z
    .array(z.object({ pattern: z.string().min(1), category: fileCategorySchema }))
    .default([]),

  tests: z
    .object({
      sourcePatterns: z.array(z.string()).default(["src/**/*.{ts,tsx,js,jsx}"]),
      testPatterns: z
        .array(z.string())
        .default(["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}", "tests/**"])
    })
    .default({}),

  risk: z
    .object({
      warnThreshold: z.number().min(0).max(100).default(40),
      failThreshold: z.number().min(0).max(100).default(70)
    })
    .default({}),

  ai: z
    .object({
      enabled: z.boolean().default(false),
      /** When true, an AI failure aborts analysis instead of degrading to rules-only. */
      required: z.boolean().default(false),
      provider: z.enum(["ollama", "openai", "mock"]).default("ollama"),
      model: z.string().optional(),
      baseUrl: z.string().url().optional(),
      maxFiles: z.number().int().positive().default(30),
      maxContextChars: z.number().int().positive().default(24000),
      minimumConfidence: z.number().min(0).max(1).default(0.7)
    })
    .default({}),

  output: z
    .object({
      dir: z.string().default(".changeguard"),
      markdown: z.boolean().default(true),
      json: z.boolean().default(true),
      sarif: z.boolean().default(false)
    })
    .default({})
});

export type ChangeGuardConfig = z.infer<typeof configSchema>;
/** The shape a user passes to defineConfig (all fields optional). */
export type ChangeGuardConfigInput = z.input<typeof configSchema>;
