import type { Mode } from "./types.js";

const MODES: readonly Mode[] = ["replay", "record", "refresh"];

/**
 * Picks the mode: an explicit option wins, then `LLM_CASSETTE_MODE`, then
 * `replay` on CI (so CI never touches the network) and `record` elsewhere.
 */
export function resolveMode(explicit?: Mode): Mode {
  if (explicit) return explicit;
  const env = process.env.LLM_CASSETTE_MODE;
  if (env) {
    if (!(MODES as readonly string[]).includes(env)) {
      throw new Error(`LLM_CASSETTE_MODE must be one of ${MODES.join(", ")}; got "${env}"`);
    }
    return env as Mode;
  }
  return process.env.CI ? "replay" : "record";
}
