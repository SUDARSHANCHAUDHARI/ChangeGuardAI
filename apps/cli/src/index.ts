import { Command } from "commander";
import { ExitCode, isChangeGuardError } from "@changeguard/core";
import { createContext, type GlobalFlags } from "./context.js";
import { runInit } from "./commands/init.js";
import { runInspect } from "./commands/inspect.js";
import { runDiff } from "./commands/diff.js";
import { runAnalyze, type AnalyzeOptions } from "./commands/analyze.js";
import { runRisk } from "./commands/risk.js";
import { runTestPlan } from "./commands/test-plan.js";
import { runReport } from "./commands/report.js";
import { runRulesList, runRulesTest, type RulesTestOptions } from "./commands/rules.js";
import type { SourceOptions } from "./resolve-source.js";
import type { AnalyzeCliOptions } from "./run-analysis.js";

const program = new Command();

program
  .name("changeguard")
  .description("ChangeGuard AI — analyze Git changes and report risk, impact, and test gaps.")
  .version("0.1.0")
  .option("--verbose", "verbose (debug) logging")
  .option("--quiet", "only log errors")
  .option("--json", "emit machine-readable JSON where supported")
  .option("--config <path>", "path to a config file")
  .option("--cwd <path>", "run as if invoked from this directory");

function globalFlags(command: Command): GlobalFlags {
  return command.optsWithGlobals() as GlobalFlags;
}

/** Attach the shared diff-selection options to a command. */
function withSourceOptions(cmd: Command, withPr = true): Command {
  cmd
    .option("--base <ref>", "base ref to compare against (default: config baseBranch)")
    .option("--head <ref>", "head ref (default: HEAD)")
    .option("--commits <range>", "commit range, e.g. abc123..def456")
    .option("--diff <path>", "analyze a patch file instead of git refs")
    .option("--staged", "compare staged changes")
    .option("--working", "compare working tree against HEAD");
  if (withPr) {
    cmd.option("--pr <number>", "analyze a GitHub pull request (read-only; needs GITHUB_TOKEN)");
  }
  return cmd;
}

/**
 * Run a command action, translating thrown errors into documented exit codes.
 * ChangeGuardError carries its own exitCode; anything else is an internal error.
 */
async function guard(command: Command, fn: (flags: GlobalFlags) => Promise<number>): Promise<void> {
  const flags = globalFlags(command);
  try {
    process.exitCode = await fn(flags);
  } catch (err) {
    if (isChangeGuardError(err)) {
      process.stderr.write(`error [${err.code}]: ${err.message}\n`);
      if (err.hint !== undefined) process.stderr.write(`hint: ${err.hint}\n`);
      process.exitCode = err.exitCode;
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`error: ${message}\n`);
      if (flags.verbose && err instanceof Error && err.stack !== undefined) {
        process.stderr.write(err.stack + "\n");
      }
      process.exitCode = ExitCode.InternalError;
    }
  }
}

program
  .command("init")
  .description("Scaffold changeguard.config.ts and ignore .changeguard output")
  .action(async (_opts, command: Command) => {
    await guard(command, async (flags) => runInit(await createContext(flags)));
  });

program
  .command("inspect")
  .description("Detect and print repository metadata")
  .action(async (_opts, command: Command) => {
    await guard(command, async (flags) => runInspect(await createContext(flags)));
  });

withSourceOptions(program.command("diff").description("Collect and classify changed files")).action(
  async (opts: SourceOptions, command: Command) => {
    await guard(command, async (flags) => runDiff(await createContext(flags), opts));
  }
);

withSourceOptions(program.command("analyze").description("Run full analysis and generate reports"))
  .option("--format <format>", "output format: human | markdown | json", "human")
  .option("--fail-on <level>", "exit non-zero when risk >= level (low|moderate|high|critical)")
  .option("--no-ai", "disable AI analysis (deterministic rules only)")
  .option("--no-write", "do not write reports to the output directory")
  .action(async (opts: AnalyzeOptions, command: Command) => {
    await guard(command, async (flags) => runAnalyze(await createContext(flags), opts));
  });

withSourceOptions(program.command("risk").description("Compute and print the deterministic risk score"))
  .option("--fail-on <level>", "exit non-zero when risk >= level (low|moderate|high|critical)")
  .option("--no-ai", "disable AI analysis (deterministic rules only)")
  .action(async (opts: AnalyzeCliOptions, command: Command) => {
    await guard(command, async (flags) => runRisk(await createContext(flags), opts));
  });

withSourceOptions(program.command("test-plan").description("Generate the deterministic test plan"))
  .option("--no-ai", "disable AI analysis (deterministic rules only)")
  .action(async (opts: AnalyzeCliOptions, command: Command) => {
    await guard(command, async (flags) => runTestPlan(await createContext(flags), opts));
  });

withSourceOptions(program.command("report").description("Write the full report set to the output directory"))
  .option("--fail-on <level>", "exit non-zero when risk >= level (low|moderate|high|critical)")
  .option("--no-ai", "disable AI analysis (deterministic rules only)")
  .action(async (opts: AnalyzeCliOptions, command: Command) => {
    await guard(command, async (flags) => runReport(await createContext(flags), opts));
  });

const rules = program.command("rules").description("Inspect and test the rule set");
rules
  .command("list")
  .description("List all built-in rules")
  .action(async (_opts, command: Command) => {
    await guard(command, async (flags) => runRulesList(await createContext(flags)));
  });
withSourceOptions(rules.command("test").description("Run rules against the current diff"))
  .option("--rule <id>", "test a single rule by id")
  .action(async (opts: RulesTestOptions, command: Command) => {
    await guard(command, async (flags) => runRulesTest(await createContext(flags), opts));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = ExitCode.InternalError;
});
