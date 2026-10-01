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
 * Trims the common prefix and suffix of two strings, keeping some context, so
 * a one-word edit in a long prompt doesn't send the whole prompt twice.
 */
function trimEdit(a: string, b: string): { before: string; after: string } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const from = Math.max(0, start - CONTEXT);
  const cut = (s: string) => {
    const to = Math.min(s.length, s.length - end + CONTEXT);
    return (from > 0 ? "…" : "") + s.slice(from, to) + (to < s.length ? "…" : "");
  };
  return { before: cut(a), after: cut(b) };
}

/** Leaf-level differences between two JSON values, e.g. `messages[2].content`. */
export function diffJson(a: unknown, b: unknown, path = ""): Change[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => diffJson(a[i], b[i], `${path}[${i}]`)).flat();
  }
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffJson(a[k], b[k], path ? `${path}.${k}` : k));
  }
  if (canonicalJson(a) === canonicalJson(b)) return [];
  if (typeof a === "string" && typeof b === "string") return [{ path, ...trimEdit(a, b) }];
  return [{ path, before: a ?? null, after: b ?? null }];
}

/** The conversation-text fields of a request body, which is all Jev judges. */
export function textFields(req: RecordedRequest): Record<string, unknown> {
  const body = isObj(req.body) ? req.body : {};
  return Object.fromEntries(TEXT_FIELDS[req.provider].filter((f) => f in body).map((f) => [f, body[f]]));
}

/** What changed in the conversation text between a recording and a new request. */
export function requestDiff(old: RecordedRequest, next: RecordedRequest): Change[] {
  return diffJson(textFields(old), textFields(next));
}
