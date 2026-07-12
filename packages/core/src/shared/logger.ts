import { pino, type Logger } from "pino";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export interface LoggerOptions {
  level?: LogLevel;
  /** When true, emit newline-delimited JSON instead of pretty text. */
  json?: boolean;
}

/**
 * Values that look like secrets are redacted from logs. This is a defensive
 * backstop — callers should not pass secrets to the logger in the first place.
 */
const REDACT_PATHS = [
  "apiKey",
  "token",
  "githubToken",
  "authorization",
  "*.apiKey",
  "*.token",
  "headers.authorization"
];

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    // Pretty transport is intentionally omitted to avoid a hard dependency on
    // pino-pretty. The CLI renders human output itself; structured JSON is
    // available via --json / --verbose for machine consumption.
    formatters: {
      level(label) {
        return { level: label };
      }
    }
  });
}

/** Resolve a log level from CLI verbosity flags. */
export function levelFromFlags(flags: { verbose?: boolean; quiet?: boolean }): LogLevel {
  if (flags.quiet) return "error";
  if (flags.verbose) return "debug";
  return "info";
}

export type { Logger };
