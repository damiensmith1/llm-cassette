import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitReport, resolveDetail } from "../report/output.js";
import type { CassetteReporterOptions } from "../report/output.js";
import type { ReportDetail, TestReport } from "../report/summary.js";
import { REPORT_DIR_ENV } from "./jest-env.js";

export type { CassetteReporterOptions } from "../report/output.js";

/**
 * Summarizes every cassette decision in the run. Add it next to your usual reporter:
 * `reporters: ["default", ["@damiensmith1/llm-cassette/jest/reporter", { detail: "all" }]]`.
 *
 * Jest runs tests in worker processes with no channel back to reporters, so
 * the setup file writes one JSON file per test into a temporary directory
 * that this reporter creates, then reads and removes at the end of the run.
 */
export default class CassetteJestReporter {
  private readonly dir: string;
  private readonly detail: ReportDetail;
  private readonly options: CassetteReporterOptions;

  /** Jest passes (globalConfig, reporterOptions, context). */
  constructor(_globalConfig?: unknown, options: CassetteReporterOptions = {}) {
    this.options = options;
    this.detail = resolveDetail(options.detail);
    this.dir = mkdtempSync(join(tmpdir(), "llm-cassette-jest-"));
    process.env[REPORT_DIR_ENV] = this.dir;
  }

  async onRunComplete() {
    const reports: TestReport[] = readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf8")) as TestReport)
      .sort((a, b) => a.file.localeCompare(b.file) || a.test.localeCompare(b.test));
    rmSync(this.dir, { recursive: true, force: true });
    await emitReport(reports, this.options, this.detail);
  }
}
