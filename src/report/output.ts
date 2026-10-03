import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { formatSummary, summarize } from "./summary.js";
import type { ReportDetail, Summary, TestReport } from "./summary.js";

const DETAILS: readonly ReportDetail[] = ["none", "changes", "all"];

/** Options shared by the Vitest and Jest reporters. */
export interface CassetteReporterOptions {
  /** How much to print under the totals line. Falls back to `LLM_CASSETTE_REPORT`, then `changes`. */
  detail?: ReportDetail;
  /** Also write the full summary as JSON here, e.g. for a CI PR comment. */
  outputFile?: string;
  /** Custom output instead of printing, e.g. to post the summary elsewhere. */
  onReport?: (summary: Summary) => void | Promise<void>;
}

export function resolveDetail(explicit?: ReportDetail): ReportDetail {
  const value = explicit ?? process.env.LLM_CASSETTE_REPORT ?? "changes";
  if (!(DETAILS as readonly string[]).includes(value)) {
    throw new Error(`LLM_CASSETTE_REPORT must be one of ${DETAILS.join(", ")}; got "${value}"`);
  }
  return value as ReportDetail;
}

/** Writes, hands off or prints the run summary, per the reporter options. */
export async function emitReport(reports: readonly TestReport[], options: CassetteReporterOptions, detail: ReportDetail) {
  const summary = summarize(reports);
  if (options.outputFile) {
    await mkdir(dirname(options.outputFile), { recursive: true });
    await writeFile(options.outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (options.onReport) await options.onReport(summary);
  else if (reports.length > 0) console.log(`\n${formatSummary(summary, detail)}\n`);
}
