import type { MatchEvent } from "../session.js";
import type { Mode } from "../types.js";

export type EventKind = MatchEvent["kind"];

/** Display order; also the order totals are printed in. */
export const EVENT_KINDS: readonly EventKind[] = ["exact", "scrubbed", "judged", "rejected", "recorded", "miss"];

/** A plain, serializable event (it crosses from Vitest workers to the reporter). */
export interface ReportEvent {
  kind: EventKind;
  method: string;
  url: string;
  reason?: string;
  p?: number;
}

export interface TestReport {
  /** Test name including the describe chain. */
  test: string;
  file: string;
  cassette: string;
  mode: Mode;
  threshold: number;
  events: ReportEvent[];
}

export interface Summary {
  totals: Record<EventKind, number>;
  tests: TestReport[];
}

/**
 * How much the formatted report lists under the totals line:
 * `none` — totals only; `changes` (default) — everything except exact and
 * scrubbed hits; `all` — every request.
 */
export type ReportDetail = "none" | "changes" | "all";

export function toReportEvents(events: readonly MatchEvent[]): ReportEvent[] {
  return events.map((e) => ({
    kind: e.kind,
    method: e.request.method,
    url: e.request.url,
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    ...(e.p !== undefined ? { p: e.p } : {}),
  }));
}

export function summarize(tests: readonly TestReport[]): Summary {
  const totals = Object.fromEntries(EVENT_KINDS.map((k) => [k, 0])) as Record<EventKind, number>;
  for (const t of tests) for (const e of t.events) totals[e.kind]++;
  return { totals, tests: [...tests] };
}

const QUIET: ReadonlySet<EventKind> = new Set(["exact", "scrubbed"]);

function describeEvent(e: ReportEvent): string {
  const p = e.p !== undefined ? ` p=${e.p.toFixed(2)}` : "";
  const reason = e.reason ? ` — ${e.reason}` : "";
  return `${e.kind}${p}: ${e.method} ${new URL(e.url).pathname}${reason}`;
}

/** Formats a summary as plain text. */
export function formatSummary(summary: Summary, detail: ReportDetail = "changes"): string {
  const counts = EVENT_KINDS.filter((k) => summary.totals[k] > 0).map((k) => `${summary.totals[k]} ${k}`);
  const lines = [`llm-cassette: ${counts.length > 0 ? counts.join(", ") : "no LLM calls"}`];
  if (detail === "none") return lines[0]!;
  for (const t of summary.tests) {
    const shown = detail === "all" ? t.events : t.events.filter((e) => !QUIET.has(e.kind));
    if (shown.length === 0) continue;
    lines.push(`  ${t.test} (${t.file})`);
    for (const e of shown) lines.push(`    ${describeEvent(e)}`);
  }
  return lines.join("\n");
}
