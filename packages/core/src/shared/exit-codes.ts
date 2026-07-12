/**
 * Process exit codes. Documented in docs/configuration.md and README.
 */
export const ExitCode = {
  /** Analysis completed and threshold not exceeded. */
  Success: 0,
  /** Internal analysis error (bug, IO failure, git failure). */
  InternalError: 1,
  /** Configured risk threshold exceeded. */
  RiskThresholdExceeded: 2,
  /** A critical security finding was reported. */
  CriticalSecurityFinding: 3,
  /** Invalid configuration. */
  InvalidConfiguration: 4
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
