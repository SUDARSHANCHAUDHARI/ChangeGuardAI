import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnalysisResult } from "../types/domain.js";
import { OutputWriteError } from "../shared/errors.js";
import { renderMarkdownReport } from "./markdown.js";
import { renderTestPlanMarkdown } from "./test-plan-md.js";

export interface WriteOptions {
  /** Absolute path to the output directory (e.g. <root>/.changeguard). */
  dir: string;
  markdown: boolean;
  json: boolean;
}

export interface WrittenFiles {
  dir: string;
  paths: string[];
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

/**
 * Write the standard ChangeGuard output set into the output directory:
 *   report.md, report.json, findings.json, test-plan.md, changed-files.json,
 *   analysis-context.json
 */
export async function writeAnalysisOutput(
  result: AnalysisResult,
  options: WriteOptions
): Promise<WrittenFiles> {
  const paths: string[] = [];
  try {
    await mkdir(options.dir, { recursive: true });

    const write = async (name: string, content: string): Promise<void> => {
      const path = join(options.dir, name);
      await writeFile(path, content, "utf8");
      paths.push(path);
    };

    if (options.json) {
      await write("report.json", pretty(result));
      await write("findings.json", pretty(result.findings));
      await write("changed-files.json", pretty(result.changedFiles));
      await write(
        "analysis-context.json",
        pretty({
          repository: result.repository,
          affectedAreas: result.affectedAreas,
          generatedAt: result.generatedAt
        })
      );
    }
    if (options.markdown) {
      await write("report.md", renderMarkdownReport(result));
      await write("test-plan.md", renderTestPlanMarkdown(result.testPlan));
    }
    return { dir: options.dir, paths };
  } catch (err) {
    if (err instanceof OutputWriteError) throw err;
    throw new OutputWriteError(options.dir, err);
  }
}
