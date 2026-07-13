import type { ChangeGuardRule } from "./types.js";
import { addedLineRule, removedGuardRule } from "./factories.js";
import { addedLines } from "./patch.js";
import { makeFinding } from "./types.js";

const LIMIT_TEXTUAL =
  "Textual diff heuristic — matches patterns on changed lines only. No data-flow or semantic analysis; can miss renamed identifiers and may flag benign matches.";

export const securityRules: ChangeGuardRule[] = [
  removedGuardRule({
    id: "security.authorization-check-removed",
    name: "Authorization check removed",
    description: "An authorization/permission guard appears to have been deleted from this file.",
    category: "security",
    severity: "high",
    only: (f) => f.category === "authorization" || f.category === "api" || f.category === "authentication",
    pattern: /\b(authorize|requireRole|hasPermission|can\(|checkPermission|isAdmin|ensureRole|abac|rbac|@Roles?)\b/i,
    recommendation: "Confirm the authorization check was intentionally moved or replaced, and add a negative test.",
    confidence: 0.55,
    limitations: LIMIT_TEXTUAL
  }),
  removedGuardRule({
    id: "security.authentication-check-removed",
    name: "Authentication check removed",
    description: "An authentication guard appears to have been deleted from this file.",
    category: "security",
    severity: "high",
    only: (f) => f.category === "authentication" || f.category === "api",
    pattern: /\b(authenticate|requireAuth|isAuthenticated|verifyToken|verifyJwt|ensureLoggedIn|passport\.authenticate)\b/i,
    recommendation: "Confirm authentication is still enforced on this path and add a negative (unauthenticated) test.",
    confidence: 0.55,
    limitations: LIMIT_TEXTUAL
  }),
  removedGuardRule({
    id: "security.input-validation-removed",
    name: "Input validation removed",
    description: "Input validation logic appears to have been removed.",
    category: "security",
    severity: "medium",
    pattern: /\b(z\.\w+\(|\.parse\(|\.safeParse\(|validate\(|Joi\.|yup\.|assert\(|sanitize\()/i,
    recommendation: "Ensure inputs on this path are still validated before use.",
    confidence: 0.4,
    limitations: LIMIT_TEXTUAL
  }),
  removedGuardRule({
    id: "security.rate-limit-removed",
    name: "Rate limit removed",
    description: "A rate limiter appears to have been removed.",
    category: "security",
    severity: "medium",
    pattern: /\b(rateLimit|rate_limit|throttle|limiter|slowDown)\b/i,
    recommendation: "Confirm rate limiting is still applied to this endpoint.",
    confidence: 0.45,
    limitations: LIMIT_TEXTUAL
  }),
  addedLineRule({
    id: "security.cors-wildcard-added",
    name: "Wildcard CORS origin added",
    description: "A wildcard CORS origin (`*`) was introduced, allowing any site to call this API.",
    category: "security",
    severity: "high",
    pattern: /Access-Control-Allow-Origin['"\s:]+\*|origin\s*:\s*['"]\*['"]|cors\(\s*\)/i,
    recommendation: "Restrict CORS to an explicit allow-list of trusted origins.",
    confidence: 0.7,
    limitations: LIMIT_TEXTUAL
  }),
  addedLineRule({
    id: "security.csp-weakened",
    name: "Content-Security-Policy weakened",
    description: "A CSP directive allowing unsafe-inline/unsafe-eval or wildcard sources was added.",
    category: "security",
    severity: "medium",
    pattern: /(unsafe-inline|unsafe-eval|Content-Security-Policy[^\n]*\*)/i,
    recommendation: "Avoid unsafe-inline/unsafe-eval and wildcard sources in CSP.",
    confidence: 0.6,
    limitations: LIMIT_TEXTUAL
  }),
  addedLineRule({
    id: "security.secret-like-value-added",
    name: "Secret-like value added",
    description: "A hardcoded credential or high-entropy secret-like literal was added.",
    category: "security",
    severity: "critical",
    // Common key prefixes + generic assignment of a long token. Values are not
    // logged elsewhere; only the matched line is stored as evidence.
    pattern:
      /(AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(secret|token|password|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9/+_-]{16,}['"])/i,
    recommendation: "Remove the secret, rotate it, and load credentials from environment or a secret manager.",
    confidence: 0.75,
    limitations:
      "Pattern/entropy heuristic. May flag example/test fixtures and may miss secrets not matching known shapes. It does not verify the secret is live.",
  }),
  addedLineRule({
    id: "security.insecure-cookie-setting",
    name: "Insecure cookie setting added",
    description: "A cookie was configured without Secure/HttpOnly or with SameSite=None.",
    category: "security",
    severity: "medium",
    pattern: /(httpOnly\s*:\s*false|secure\s*:\s*false|sameSite\s*:\s*['"]?none['"]?)/i,
    recommendation: "Set HttpOnly and Secure, and prefer SameSite=Lax/Strict for session cookies.",
    confidence: 0.6,
    limitations: LIMIT_TEXTUAL
  }),
  addedLineRule({
    id: "security.sensitive-logging-added",
    name: "Sensitive value logged",
    description: "Logging of a password/token/secret-like field was introduced.",
    category: "security",
    severity: "medium",
    pattern: /(console\.(log|info|debug)|logger?\.\w+)\([^)]*\b(password|passwd|secret|token|apiKey|api_key|authorization)\b/i,
    recommendation: "Redact or remove sensitive fields from log statements.",
    confidence: 0.55,
    limitations: LIMIT_TEXTUAL
  }),
  addedLineRule({
    id: "security.command-execution-added",
    name: "Command execution added",
    description: "A shell/command execution call was introduced, a potential injection sink.",
    category: "security",
    severity: "high",
    // Not on test files: tests legitimately spawn processes (git init, running
    // the CLI under test) and flagging those is noise, not injection risk.
    only: (f) => f.category !== "test",
    // Negative lookbehind on the bare calls so method calls like
    // `regex.exec(...)` or `arr.spawn(...)` do NOT match — only bare
    // `exec(`/`spawn(` (typically from child_process) and explicit
    // child_process/os.system/subprocess usage do.
    pattern:
      /\b(child_process|(?<![.\w])(exec|execSync|spawn|spawnSync|execFile|execFileSync)\(|os\.system\(|subprocess\.(call|run|Popen))/,
    recommendation: "Avoid shell execution with untrusted input; prefer argument arrays and validate inputs.",
    confidence: 0.5,
    limitations:
      LIMIT_TEXTUAL + " Matches bare exec/spawn calls and explicit child_process usage; skips test files and ignores method calls like regex.exec().",
  }),
  addedLineRule({
    id: "security.raw-sql-added",
    name: "Raw SQL query added",
    description: "A raw/interpolated SQL query was introduced, a potential SQL injection sink.",
    category: "security",
    severity: "high",
    pattern: /(\$queryRawUnsafe|\.query\(\s*[`'"].*\$\{|execute\(\s*[`'"].*\$\{|SELECT\s+.*\+\s*\w+)/i,
    recommendation: "Use parameterized queries or an ORM's safe query builder.",
    confidence: 0.5,
    limitations: LIMIT_TEXTUAL
  }),
  removedGuardRule({
    id: "security.token-validation-changed",
    name: "Token validation changed",
    description: "JWT/token verification options appear to have been removed or weakened.",
    category: "security",
    severity: "high",
    pattern: /\b(verify\(|verifyToken|algorithms\s*:|issuer\s*:|audience\s*:|expiresIn)\b/i,
    recommendation: "Confirm token signature, algorithm, issuer, and expiry are still verified.",
    confidence: 0.45,
    limitations: LIMIT_TEXTUAL
  }),
  {
    id: "security.github-workflow-permissions-expanded",
    name: "GitHub workflow permissions expanded",
    description: "A GitHub Actions workflow granted broad permissions or write scopes.",
    category: "security",
    defaultSeverity: "high",
    limitations:
      "Detects broad tokens on added lines in workflow files. It does not evaluate the full effective permission set across job/workflow scope.",
    async evaluate(ctx) {
      const findings = [];
      for (const file of ctx.files) {
        if (file.category !== "ci" || file.binary) continue;
        for (const line of addedLines(file.patch)) {
          if (/permissions\s*:\s*write-all|:\s*write\b|pull-requests\s*:\s*write|contents\s*:\s*write/i.test(line.content)) {
            findings.push(
              makeFinding({
                ruleId: "security.github-workflow-permissions-expanded",
                title: "GitHub workflow permissions expanded",
                description:
                  "A GitHub Actions workflow granted broad or write permissions, increasing blast radius if the workflow is compromised.",
                severity: "high",
                category: "security",
                file: file.path,
                ...(line.newLine !== undefined ? { startLine: line.newLine } : {}),
                evidence: line.content.trim().slice(0, 200),
                recommendation: "Grant the minimum required permissions per job; avoid write-all.",
                confidence: 0.65
              })
            );
          }
        }
      }
      return findings;
    }
  }
];
