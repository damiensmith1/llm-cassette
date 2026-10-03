import { canonicalJson } from "../normalize/canonical.js";
import { TEXT_FIELDS } from "../normalize/providers.js";
import type { RecordedRequest } from "../types.js";

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Characters of unchanged text kept on each side of a string edit. */
const CONTEXT = 300;

/**
 * How much unchanged text surrounds a string edit: a fixed number of
 * characters, or `"sentence"` to widen the edit to the sentence or line it
 * sits in.
 */
export type DiffContext = number | "sentence";

const BOUNDARY = /[.!?]\s|\n/g;

/** Start of the sentence or line containing index `i`. */
function sentenceStart(s: string, i: number): number {
  let start = 0;
  for (const m of s.slice(0, i).matchAll(BOUNDARY)) start = m.index! + m[0].length;
  return start;
}

/** End of the sentence or line containing index `i`. */
function sentenceEnd(s: string, i: number): number {
  BOUNDARY.lastIndex = i;
  const m = BOUNDARY.exec(s);
  return m ? m.index + 1 : s.length;
}

/**
 * Trims the common prefix and suffix of two strings, keeping some context, so
 * a one-word edit in a long prompt doesn't send the whole prompt twice.
 */
function trimEdit(a: string, b: string, context: DiffContext): { before: string; after: string } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const from = context === "sentence" ? sentenceStart(a, start) : Math.max(0, start - context);
  const cut = (s: string) => {
    const to = context === "sentence" ? sentenceEnd(s, s.length - end) : Math.min(s.length, s.length - end + context);
    return (from > 0 ? "…" : "") + s.slice(from, to).trim() + (to < s.length ? "…" : "");
  };
  return { before: cut(a), after: cut(b) };
}

/** Leaf-level differences between two JSON values, e.g. `messages[2].content`. */
export function diffJson(a: unknown, b: unknown, path = "", context: DiffContext = CONTEXT): Change[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => diffJson(a[i], b[i], `${path}[${i}]`, context)).flat();
  }
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffJson(a[k], b[k], path ? `${path}.${k}` : k, context));
  }
  if (canonicalJson(a) === canonicalJson(b)) return [];
  if (typeof a === "string" && typeof b === "string") return [{ path, ...trimEdit(a, b, context) }];
  return [{ path, before: a ?? null, after: b ?? null }];
}

/** The conversation-text fields of a request body, which is all Jev judges. */
export function textFields(req: RecordedRequest): Record<string, unknown> {
  const body = isObj(req.body) ? req.body : {};
  return Object.fromEntries(TEXT_FIELDS[req.provider].filter((f) => f in body).map((f) => [f, body[f]]));
}

/** What changed in the conversation text between a recording and a new request. */
export function requestDiff(old: RecordedRequest, next: RecordedRequest, context?: DiffContext): Change[] {
  return diffJson(textFields(old), textFields(next), "", context);
}
