import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Reporter, TestCase } from "vitest/node";
import { formatSummary, summarize } from "../report/summary.js";
import type { ReportDetail, Summary, TestReport } from "../report/summary.js";

const DETAILS: readonly ReportDetail[] = ["none", "changes", "all"];

export interface CassetteReporterOptions {
  /** How much to print under the totals line. Falls back to `LLM_CASSETTE_REPORT`, then `changes`. */
  detail?: ReportDetail;
  /** Also write the full summary as JSON here, e.g. for a CI PR comment. */
  outputFile?: string;
  /** Custom output instead of printing, e.g. to post the summary elsewhere. */
  onReport?: (summary: Summary) => void | Promise<void>;
}

function resolveDetail(explicit?: ReportDetail): ReportDetail {
  const value = explicit ?? process.env.LLM_CASSETTE_REPORT ?? "changes";
  if (!(DETAILS as readonly string[]).includes(value)) {
    throw new Error(`LLM_CASSETTE_REPORT must be one of ${DETAILS.join(", ")}; got "${value}"`);
  }
  return value as ReportDetail;
}

/**
 * Summarizes every cassette decision in the run. Add it next to your usual reporter:
 * `reporters: ["default", ["@damiensmith1/llm-cassette/vitest/reporter", { detail: "all" }]]`.
 */
export default class CassetteReporter implements Reporter {
  private readonly reports: TestReport[] = [];
  private readonly detail: ReportDetail;

  constructor(private readonly options: CassetteReporterOptions = {}) {
    this.detail = resolveDetail(options.detail);
  }

  onTestRunStart() {
    this.reports.length = 0;
  }

  onTestCaseResult(testCase: TestCase) {
    const report = testCase.meta().llmCassette;
    if (report) this.reports.push(report);
  }

  async onTestRunEnd() {
    const summary = summarize(this.reports);
    if (this.options.outputFile) {
      await mkdir(dirname(this.options.outputFile), { recursive: true });
      await writeFile(this.options.outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
    }
    if (this.options.onReport) await this.options.onReport(summary);
    else if (this.reports.length > 0) console.log(`\n${formatSummary(summary, this.detail)}\n`);
  }
}
