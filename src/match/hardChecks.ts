import { canonicalJson } from "../normalize/canonical.js";
import { calledTools, mediaParts, TEXT_FIELDS, toolSchemas } from "../normalize/providers.js";
import type { Scrubber } from "../normalize/scrub.js";
import type { Interaction, RecordedRequest } from "../types.js";

export type CheckResult = { ok: true } | { ok: false; reason: string };

type Obj = Record<string, unknown>;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const fieldsOf = (body: unknown): Obj => (body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Obj) : {});

/**
 * Deterministic checks that decide whether a near-miss recording may go to
 * Jev at all. Anything Jev is weak at or can't see — numbers, settings,
 * schemas, images — must match exactly here. Conservative on purpose: when
 * in doubt, reject and re-record.
 */
export function hardChecks(candidate: Interaction, req: RecordedRequest, scrubber?: Scrubber): CheckResult {
  const old = candidate.request;
  if (old.provider !== req.provider || old.method !== req.method || old.url !== req.url) {
    return { ok: false, reason: "endpoint changed" };
  }
  const a = fieldsOf(old.body);
  const b = fieldsOf(req.body);

  if (!same(a.model, b.model)) {
    return { ok: false, reason: `model changed (${String(a.model)} → ${String(b.model)})` };
  }

  // Settings: every field outside the conversation text, minus caller fields.
  const skip = new Set([...TEXT_FIELDS[req.provider], ...(scrubber?.ignoreFields ?? [])]);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !skip.has(k)).sort();
  const changed = keys.filter((k) => !same(a[k], b[k]));
  if (changed.length > 0) return { ok: false, reason: `settings changed: ${changed.join(", ")}` };

  if (!same(mediaParts(a), mediaParts(b))) return { ok: false, reason: "image, audio or file input changed" };

  const called = calledTools(req.provider, candidate.response.body);
  if (called === undefined) return { ok: false, reason: "recorded response can't be read (streamed responses aren't judged yet)" };
  const oldTools = toolSchemas(req.provider, a);
  const newTools = toolSchemas(req.provider, b);
  for (const name of called) {
    if (!newTools.has(name)) return { ok: false, reason: `recorded reply calls tool "${name}", which was removed` };
    if (!same(oldTools.get(name), newTools.get(name))) {
      return { ok: false, reason: `schema of called tool "${name}" changed` };
    }
  }
  return { ok: true };
}
