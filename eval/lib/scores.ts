import { hashOf } from "../../src/normalize/canonical.js";
import { createJevJudge, verdictKey } from "../../src/match/jev.js";
import type { Judge } from "../../src/match/jev.js";
import { createSpanJudge } from "../../src/match/span.js";
import { readJson, SCORES_FILE, writeJson } from "./dataset.js";
import type { Pair } from "./dataset.js";

export interface Run {
  p: number;
  signals: Record<string, number>;
  model: string;
  inputTokens: number;
  ms: number;
  at: string;
}

export interface PairScore {
  /** Changes when the pair, its reply or the judge's wording changes; stale runs are dropped. */
  key: string;
  runs: Run[];
  error?: string;
}

/** judge id → pair id → score. */
export type Scores = Record<string, Record<string, PairScore>>;

export const readScores = () => readJson<Scores>(SCORES_FILE, {});
export const writeScores = (scores: Scores) => writeJson(SCORES_FILE, scores);

export const scoreKey = (pair: Pair, judgeId: string) =>
  hashOf({ verdict: verdictKey(pair.old, pair.next, judgeId), response: pair.response });

/** The judges under test. `SPAN_MODEL=span-01-pro` swaps in the paid span-01 tier. */
export const evalJudges = (): Judge[] => [createJevJudge(), createSpanJudge({ model: process.env.SPAN_MODEL ?? "span-01-free" })];

/** USD per million input tokens (output is free for both). */
const PRICES: [prefix: string, usd: number][] = [
  ["jev-", 0.042],
  ["span-01-pro", 0.02],
  ["span-01-free", 0],
];

export const pricePerMillion = (judgeId: string) => PRICES.find(([prefix]) => judgeId.startsWith(prefix))?.[1];

/** Mean p over a pair's runs, or undefined if it was never scored. */
export function meanP(score: PairScore | undefined): number | undefined {
  if (!score || score.runs.length === 0) return undefined;
  return score.runs.reduce((sum, r) => sum + r.p, 0) / score.runs.length;
}
