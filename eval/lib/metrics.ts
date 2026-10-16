/** A judged pair: the judge's p(valid), and whether the answer key says replay. */
export interface Scored {
  p: number;
  replay: boolean;
}

export interface Counts {
  /** Re-record pairs the judge would replay: the costly error, a stale answer passes silently. */
  wrongReplays: number;
  negatives: number;
  /** Replay pairs the judge would replay: re-records avoided. */
  kept: number;
  positives: number;
}

/** Outcomes at threshold `t` (replay when p ≥ t). */
export function counts(items: readonly Scored[], t: number): Counts {
  const c: Counts = { wrongReplays: 0, negatives: 0, kept: 0, positives: 0 };
  for (const { p, replay } of items) {
    if (replay) {
      c.positives++;
      if (p >= t) c.kept++;
    } else {
      c.negatives++;
      if (p >= t) c.wrongReplays++;
    }
  }
  return c;
}

/**
 * The lowest threshold whose wrong-replay rate is at most `maxRate`. It sits
 * halfway between the highest re-record score it has to exclude and the next
 * replay score above that, rather than on either score, so it isn't fitted
 * to one example. Above 1 means "never replay".
 */
export function chooseThreshold(items: readonly Scored[], maxRate = 0): number {
  const negatives = items.filter((s) => !s.replay).map((s) => s.p).sort((a, b) => b - a);
  const floor = negatives[Math.floor(maxRate * negatives.length)];
  if (floor === undefined) return Math.min(...items.map((s) => s.p), 1);
  const above = items.filter((s) => s.replay && s.p > floor).map((s) => s.p);
  if (above.length > 0) return (floor + Math.min(...above)) / 2;
  return floor < 1 ? (floor + 1) / 2 : 1 + 1e-9;
}

/**
 * Wilson score interval for k successes in n trials (95% by default). With
 * k = 0 the upper bound is roughly 3/n, the "rule of three": zero errors in
 * 30 pairs only shows the rate is probably under 10%.
 */
export function wilson(k: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/**
 * Area under the ROC curve: the chance a random replay pair scores above a
 * random re-record pair. Threshold-free; 1 is perfect separation, 0.5 is a
 * coin flip. Undefined without both kinds.
 */
export function auc(items: readonly Scored[]): number | undefined {
  const pos = items.filter((s) => s.replay).map((s) => s.p);
  const neg = items.filter((s) => !s.replay).map((s) => s.p);
  if (pos.length === 0 || neg.length === 0) return undefined;
  let sum = 0;
  for (const a of pos) for (const b of neg) sum += a > b ? 1 : a === b ? 0.5 : 0;
  return sum / (pos.length * neg.length);
}

/**
 * Agreement between two labellers, corrected for the agreement chance alone
 * would give. 1 is perfect, 0 is chance; above ~0.8 is usually read as
 * strong. Undefined for no pairs.
 */
export function cohensKappa<T>(pairs: readonly (readonly [T, T])[]): number | undefined {
  const n = pairs.length;
  if (n === 0) return undefined;
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  let expected = 0;
  for (const c of new Set(pairs.flat())) {
    expected += (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n);
  }
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

/** Nearest-rank percentile, q in (0, 1]. */
export function percentile(values: readonly number[], q: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** A seeded shuffle (mulberry32), so a sample is the same on every run. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Up to `n` items spread evenly across groups, round-robin over seeded shuffles. */
export function stratifiedSample<T>(items: readonly T[], groupOf: (item: T) => string, n: number, seed = 1): T[] {
  const groups = new Map<string, T[]>();
  for (const item of shuffle(items, seed)) {
    const key = groupOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const queues = [...groups.keys()].sort().map((k) => groups.get(k)!);
  const out: T[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) if (out.length < n && q.length > 0) out.push(q.shift()!);
  }
  return out;
}
