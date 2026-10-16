import { describe, expect, it } from "vitest";
import { auc, chooseThreshold, cohensKappa, counts, stratifiedSample, wilson } from "../eval/lib/metrics.js";

const s = (p: number, replay: boolean) => ({ p, replay });

describe("eval metrics", () => {
  it("counts wrong replays and kept replays at a threshold", () => {
    const items = [s(0.9, true), s(0.6, true), s(0.7, false), s(0.1, false)];
    expect(counts(items, 0.65)).toEqual({ wrongReplays: 1, negatives: 2, kept: 1, positives: 2 });
  });

  it("puts the threshold midway between the highest re-record and the next replay above it", () => {
    const items = [s(0.95, true), s(0.8, true), s(0.4, true), s(0.6, false), s(0.2, false)];
    expect(chooseThreshold(items)).toBeCloseTo(0.7);
    expect(counts(items, chooseThreshold(items)).wrongReplays).toBe(0);
  });

  it("lets a wrong-replay budget lower the threshold", () => {
    const items = [s(0.95, true), s(0.8, true), s(0.9, false), s(0.2, false)];
    expect(chooseThreshold(items)).toBeCloseTo(0.925);
    expect(chooseThreshold(items, 0.5)).toBeCloseTo(0.5);
  });

  it("never replays when a re-record scores 1", () => {
    expect(counts([s(1, false), s(1, true)], chooseThreshold([s(1, false), s(1, true)])).wrongReplays).toBe(0);
  });

  it("gives the rule-of-three upper bound for zero errors", () => {
    expect(wilson(0, 30).high).toBeGreaterThan(0.09);
    expect(wilson(0, 30).high).toBeLessThan(0.13);
    expect(wilson(5, 10).low).toBeLessThan(0.5);
    expect(wilson(5, 10).high).toBeGreaterThan(0.5);
  });

  it("measures separation as AUC", () => {
    expect(auc([s(0.9, true), s(0.1, false)])).toBe(1);
    expect(auc([s(0.1, true), s(0.9, false)])).toBe(0);
    expect(auc([s(0.5, true), s(0.5, false)])).toBe(0.5);
    expect(auc([s(0.5, true)])).toBeUndefined();
  });

  it("corrects agreement for chance with Cohen's kappa", () => {
    expect(cohensKappa([["a", "a"], ["b", "b"]])).toBe(1);
    // 50% raw agreement on a 50/50 split is exactly chance.
    expect(cohensKappa([["a", "a"], ["a", "b"], ["b", "a"], ["b", "b"]])).toBe(0);
  });

  it("samples evenly across groups, the same way every time", () => {
    const items = ["a1", "a2", "a3", "a4", "b1", "c1"];
    const sample = stratifiedSample(items, (x) => x[0]!, 3);
    expect(new Set(sample.map((x) => x[0]))).toEqual(new Set(["a", "b", "c"]));
    expect(stratifiedSample(items, (x) => x[0]!, 3)).toEqual(sample);
  });
});
