import { hashOf } from "./canonical.js";
import type { RecordedRequest } from "../types.js";

/** ISO-8601 dates and datetimes, e.g. 2026-10-01 or 2026-10-01T12:30:00.123Z. */
const ISO_DATETIME = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const DEFAULT_PATTERNS: readonly RegExp[] = [ISO_DATETIME, UUID];

/** Top-level body fields that identify the caller but don't change the answer. */
export const DEFAULT_IGNORE_FIELDS: readonly string[] = ["user", "metadata"];

export const SCRUBBED = "<scrubbed>";

export interface ScrubOptions {
  /** Extra patterns, added to the defaults, replaced in every string in the body. */
  patterns?: readonly RegExp[];
  /** Extra top-level body fields, added to the defaults, left out of the comparison. */
  ignoreFields?: readonly string[];
}

export interface Scrubber {
  patterns: readonly RegExp[];
  ignoreFields: ReadonlySet<string>;
}

/** Builds the scrubber from user options; `false` turns scrubbing off. */
export function createScrubber(options?: ScrubOptions | false): Scrubber | undefined {
  if (options === false) return undefined;
  const extra = (options?.patterns ?? []).map((p) =>
    p.global ? p : new RegExp(p.source, p.flags + "g"),
  );
  return {
    patterns: [...DEFAULT_PATTERNS, ...extra],
    ignoreFields: new Set([...DEFAULT_IGNORE_FIELDS, ...(options?.ignoreFields ?? [])]),
  };
}

function scrubValue(value: unknown, s: Scrubber): unknown {
  if (typeof value === "string") {
    return s.patterns.reduce((text, p) => text.replace(p, SCRUBBED), value);
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, s));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v, s)]));
  }
  return value;
}

/** The body as compared on the scrubbed rung. Never written to the cassette. */
export function scrubBody(body: unknown, s: Scrubber): unknown {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const kept = Object.entries(body).filter(([k]) => !s.ignoreFields.has(k));
    return scrubValue(Object.fromEntries(kept), s);
  }
  return scrubValue(body, s);
}

/**
 * The scrubbed-match key. Scrubbing runs on both sides at match time, so a
 * rule added later also applies to cassettes recorded before it.
 */
export function scrubbedKey(req: RecordedRequest, s: Scrubber): string {
  return hashOf({ method: req.method, url: req.url, body: scrubBody(req.body, s) });
}
