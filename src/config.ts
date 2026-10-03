import type { Mode } from "./types.js";

const MODES: readonly Mode[] = ["replay", "record", "refresh"];

/** Placeholder until tuned on labeled prompt edits (see docs/design.md). */
export const DEFAULT_THRESHOLD = 0.85;

/** Reads an env var, treating an empty string as unset. */
function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

/**
 * Picks the mode: an explicit option wins, then `LLM_CASSETTE_MODE`, then
 * `replay` on CI (so CI never touches the network) and `record` elsewhere.
 */
export function resolveMode(explicit?: Mode): Mode {
  if (explicit) return explicit;
  const value = env("LLM_CASSETTE_MODE");
  if (value) {
    if (!(MODES as readonly string[]).includes(value)) {
      throw new Error(`LLM_CASSETTE_MODE must be one of ${MODES.join(", ")}; got "${value}"`);
    }
    return value as Mode;
  }
  return env("CI") ? "replay" : "record";
}

/**
 * Picks the judge threshold: the session option, then `LLM_CASSETTE_THRESHOLD`
 * (a run-wide override), then the judge's own threshold, then 0.85.
 */
export function resolveThreshold(explicit?: number, judgeDefault?: number): number {
  const raw = explicit ?? env("LLM_CASSETTE_THRESHOLD") ?? judgeDefault;
  if (raw === undefined) return DEFAULT_THRESHOLD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`llm-cassette threshold must be a number from 0 to 1; got "${raw}"`);
  }
  return value;
}
