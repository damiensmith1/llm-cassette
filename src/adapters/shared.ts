import { relative } from "node:path";
import { toReportEvents } from "../report/summary.js";
import type { TestReport } from "../report/summary.js";
import type { CassetteSession } from "../session.js";

/** The run-report entry for one test, or undefined if it made no LLM calls. */
export function testReport(session: CassetteSession, testFile: string, names: readonly string[]): TestReport | undefined {
  if (session.events.length === 0) return undefined;
  return {
    test: names.join(" > "),
    file: relative(process.cwd(), testFile),
    cassette: relative(process.cwd(), session.path),
    mode: session.mode,
    threshold: session.threshold,
    events: toReportEvents(session.events),
  };
}

/** The error that fails a test whose LLM calls had no usable recording, if any. */
export function missError(session: CassetteSession): Error | undefined {
  const misses = session.events.filter((e) => e.kind === "miss" || e.kind === "rejected");
  if (misses.length === 0) return undefined;
  const list = misses.map((m) => `  ${m.request.method} ${m.request.url}: ${m.reason ?? "no match"}`).join("\n");
  return new Error(
    `llm-cassette: ${misses.length} request(s) had no usable recording in ${session.path}:\n${list}\n` +
      `Run with LLM_CASSETTE_MODE=record to record them.`,
  );
}
