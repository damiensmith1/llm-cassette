import { createHash } from "node:crypto";

/**
 * Returns a copy of `value` with object keys sorted recursively, so equal
 * requests always serialize, hash and diff the same way. Array order is kept.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** Sorted-key JSON. Pass `indent` for human-readable output. */
export function canonicalJson(value: unknown, indent?: number): string {
  return JSON.stringify(canonicalize(value), null, indent);
}

/** sha256 hex of the canonical JSON of `value`. */
export function hashOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
