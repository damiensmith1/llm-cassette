import type { Cassette, RecordedRequest } from "../types.js";

/**
 * The recording a near-miss request is compared against: the unused one at
 * the same position in the call sequence if it hits the same endpoint, else
 * the first unused one that does.
 */
export function pickCandidate(
  cassette: Cassette,
  used: ReadonlySet<number>,
  callIndex: number,
  req: RecordedRequest,
): number {
  const fits = (i: number) => {
    const r = cassette.interactions[i]?.request;
    return r !== undefined && !used.has(i) && r.method === req.method && r.url === req.url;
  };
  if (fits(callIndex)) return callIndex;
  return cassette.interactions.findIndex((_, i) => fits(i));
}
