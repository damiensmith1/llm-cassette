import type { Reporter, TestCase } from "vitest/node";
import { emitReport, resolveDetail } from "../report/output.js";
import type { CassetteReporterOptions } from "../report/output.js";
import type { ReportDetail, TestReport } from "../report/summary.js";

export type { CassetteReporterOptions } from "../report/output.js";

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
    await emitReport(this.reports, this.options, this.detail);
  }
}
