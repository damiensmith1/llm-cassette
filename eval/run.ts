/**
 * Judges every pair that would reach the judge and caches the scores in
 * eval/results/scores.json. Only missing or stale scores are fetched, and
 * each one is saved as it arrives, so re-running is free and stopping
 * midway loses nothing. See docs/evals.md.
 *
 *   npm run eval:run                       every judge that has a key
 *   npm run eval:run -- --judge jev        judges whose id starts with "jev"
 *   npm run eval:run -- --repeats 3        three runs per pair, for stability
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { hardCheck, loadDataset } from "./lib/dataset.js";
import type { Pair } from "./lib/dataset.js";
import { evalJudges, pricePerMillion, readScores, scoreKey, writeScores } from "./lib/scores.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values } = parseArgs({
  options: {
    judge: { type: "string" },
    repeats: { type: "string", default: "1" },
    concurrency: { type: "string", default: "4" },
  },
});
const repeats = Number(values.repeats);
const concurrency = Number(values.concurrency);

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

const pairs = (await loadDataset()).filter((p) => hardCheck(p).ok);
const ids = new Set(pairs.map((p) => p.id));
const scores = readScores();

const judges = evalJudges().filter((j) => !values.judge || j.id.startsWith(values.judge));
if (judges.length === 0) {
  console.error(`No judge id starts with "${values.judge}". Judges: ${evalJudges().map((j) => j.id).join(", ")}`);
  process.exit(1);
}

for (const judge of judges) {
  const problem = judge.setupProblem?.();
  if (problem) {
    console.log(`${judge.id}: skipped (${problem})`);
    continue;
  }
  const table = (scores[judge.id] ??= {});
  for (const id of Object.keys(table)) if (!ids.has(id)) delete table[id];

  const todo: Pair[] = [];
  for (const pair of pairs) {
    const key = scoreKey(pair, judge.id);
    if (table[pair.id]?.key !== key) table[pair.id] = { key, runs: [] };
    for (let i = table[pair.id]!.runs.length; i < repeats; i++) todo.push(pair);
  }
  if (todo.length === 0) {
    console.log(`${judge.id}: all ${pairs.length} pairs already scored, nothing to call`);
    continue;
  }
  console.log(`${judge.id}: ${todo.length} calls to make, ${pairs.length * repeats - todo.length} cached`);

  let done = 0;
  let failed = 0;
  let tokens = 0;
  let stopped = false;
  await pool(todo, concurrency, async (pair) => {
    if (stopped) return;
    const entry = table[pair.id]!;
    const started = performance.now();
    try {
      const j = await judge.judge({ old: pair.old, next: pair.next, response: pair.response });
      const ms = Math.round(performance.now() - started);
      entry.runs.push({ p: j.p, signals: j.signals, model: j.model, inputTokens: j.inputTokens, ms, at: new Date().toISOString() });
      delete entry.error;
      tokens += j.inputTokens;
    } catch (e) {
      failed++;
      entry.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      if (/\b429\b|rate.?limit|quota|daily/i.test(entry.error)) {
        stopped = true;
        console.log(`\n${judge.id}: rate limited (${entry.error}). Re-run later; finished pairs are saved.`);
      }
    }
    writeScores(scores);
    done++;
    process.stdout.write(`\r${judge.id}: ${done}/${todo.length}${failed ? `, ${failed} failed` : ""}`);
  });

  const price = pricePerMillion(judge.id);
  const cost = price === undefined ? "" : `, ~$${((tokens / 1e6) * price).toFixed(4)}`;
  console.log(`\n${judge.id}: done, ${tokens.toLocaleString()} input tokens${cost}`);
}
console.log("Next: npm run eval:report");
