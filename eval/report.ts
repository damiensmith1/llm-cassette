/**
 * Scores the judges against the answer key and writes eval/results/report.md.
 * Each judge's threshold is chosen on the tune split and reported on the
 * held-out test split. See docs/evals.md for how to read it.
 *
 *   npm run eval:report
 *   npm run eval:report -- --reviewed-only          human-labelled pairs only
 *   npm run eval:report -- --max-wrong-replay 0.02  allow 2% wrong replays on tune
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_THRESHOLD } from "../src/config.js";
import { blindAgreement, hardCheck, loadDataset, REPORT_FILE } from "./lib/dataset.js";
import type { Pair } from "./lib/dataset.js";
import { auc, chooseThreshold, counts, percentile, wilson } from "./lib/metrics.js";
import type { Scored } from "./lib/metrics.js";
import { meanP, pricePerMillion, readScores } from "./lib/scores.js";
import type { Split, Tag } from "./lib/types.js";

const { values } = parseArgs({
  options: {
    "reviewed-only": { type: "boolean", default: false },
    "max-wrong-replay": { type: "string", default: "0" },
  },
});
const maxRate = Number(values["max-wrong-replay"]);
const SWEEP = [0.3, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99];
const TAGS: Tag[] = ["long-prompt", "structured", "tools", "multi-turn"];

const all = await loadDataset();
const pairs = values["reviewed-only"] ? all.filter((p) => p.human) : all;
const scores = readScores();

const md: string[] = [];
const say = (...lines: string[]) => md.push(...lines);
/** One line per judge, shown at the top of the report and in the terminal. */
const summary: string[] = [];
const pct = (k: number, n: number) => (n === 0 ? "–" : `${k}/${n} (${Math.round((100 * k) / n)}%)`);
const upper = (k: number, n: number) => (n === 0 ? "–" : `≤${Math.round(100 * wilson(k, n).high)}%`);
const f2 = (x: number | undefined) => (x === undefined ? "–" : x.toFixed(2));
const table = (head: string[], rows: (string | number)[][]) => [
  `| ${head.join(" | ")} |`,
  `|${head.map(() => "---").join("|")}|`,
  ...rows.map((r) => `| ${r.map((c) => String(c).replaceAll("|", "\\|")).join(" | ")} |`),
  "",
];
const count = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length;

say(
  "# Judge eval report",
  "",
  `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run eval:report\`${values["reviewed-only"] ? " --reviewed-only" : ""}. How to read it: docs/evals.md.`,
  "",
);

// Dataset
const reviewed = count(pairs, (p) => !!p.human);
const stopped = pairs.flatMap((p) => {
  const r = hardCheck(p);
  return r.ok ? [] : [r.reason];
});
say(
  "## Dataset",
  "",
  `- ${pairs.length} pairs from ${new Set(pairs.map((p) => p.family)).size} families: ${count(pairs, (p) => p.split === "tune")} tune, ${count(pairs, (p) => p.split === "test")} test.`,
  `- Labels: ${count(pairs, (p) => p.label === "replay")} replay, ${count(pairs, (p) => p.label === "rerecord")} re-record, ${count(pairs, (p) => p.label === "unsure")} unsure (left out of scoring).`,
  `- Reviewed by a human: ${reviewed}/${pairs.length} (${count(pairs, (p) => !!p.human?.blind)} blind).`,
  `- Stopped by the hard checks before the judge: ${stopped.length}${stopped.length ? ` (${stopped.join("; ")})` : ""}.`,
  "",
);
if (reviewed < pairs.length) {
  say(`> **Provisional.** ${pairs.length - reviewed} labels are LLM drafts nobody has reviewed. Run \`npm run eval:review\`.`, "");
}

// Label agreement
const agreement = blindAgreement(pairs);
say("## Label agreement (blind round)", "");
if (agreement.n === 0) {
  say("No blind labels yet: `npm run eval:review -- --blind 30`.", "");
} else {
  say(`${pct(agreement.agreed, agreement.n)} agree with the draft; Cohen's κ ${f2(agreement.kappa)}.`, "");
  if (agreement.disagreements.length > 0) {
    say(
      ...table(
        ["pair", "human", "draft", "draft's reason", "note"],
        agreement.disagreements.map((p) => [p.id, p.human!.label, p.draft, p.why, p.human!.note ?? ""]),
      ),
    );
  }
}

// Judges, one section each
interface Judged extends Scored {
  pair: Pair;
}
const judgeable = pairs.filter((p) => p.label !== "unsure" && hardCheck(p).ok);
const chosen = new Map<string, number>();

for (const judgeId of Object.keys(scores).sort()) {
  const results = scores[judgeId]!;
  const scored = (split: Split): Judged[] =>
    judgeable
      .filter((p) => p.split === split)
      .flatMap((pair) => {
        const p = meanP(results[pair.id]);
        return p === undefined ? [] : [{ pair, p, replay: pair.label === "replay" }];
      });
  const tune = scored("tune");
  const test = scored("test");
  say(`## ${judgeId}`, "");
  const missing = judgeable.length - tune.length - test.length;
  if (missing > 0) say(`${missing} of ${judgeable.length} judgeable pairs have no score yet (\`npm run eval:run\`).`, "");
  if (tune.length === 0) continue;

  const t = chooseThreshold(tune, maxRate);
  chosen.set(judgeId, t);
  const atDefault = counts(test, DEFAULT_THRESHOLD);
  const atChosen = counts(test, t);
  summary.push(
    `- **${judgeId}**: AUC ${f2(auc(test))} on test. At ${DEFAULT_THRESHOLD} (current default), ${atDefault.wrongReplays}/${atDefault.negatives} broken replies replayed and ${atDefault.kept}/${atDefault.positives} valid ones kept; at ${t.toFixed(2)} (chosen on tune), ${atChosen.wrongReplays}/${atChosen.negatives} and ${atChosen.kept}/${atChosen.positives}.`,
  );
  const row = (name: string, items: Judged[], th: number) => {
    const c = counts(items, th);
    return [name, th.toFixed(3), pct(c.wrongReplays, c.negatives), upper(c.wrongReplays, c.negatives), pct(c.kept, c.positives)];
  };
  say(
    `Separation (AUC): tune ${f2(auc(tune))}, test ${f2(auc(test))}.`,
    "",
    `Chosen threshold **${t.toFixed(3)}**: the lowest with ${maxRate === 0 ? "no" : `at most ${maxRate * 100}%`} wrong replays on tune, placed midway to the next replay score.`,
    "",
    ...table(
      ["split", "threshold", "wrong replays", "95% upper bound", "replays kept"],
      [row("tune", tune, t), row("**test**", test, t), row("test at the current default", test, DEFAULT_THRESHOLD)],
    ),
    "Sweep on tune (thresholds are chosen here, never on test):",
    "",
    ...table(
      ["threshold", "wrong replays", "replays kept"],
      SWEEP.map((th) => {
        const c = counts(tune, th);
        return [th.toFixed(2), pct(c.wrongReplays, c.negatives), pct(c.kept, c.positives)];
      }),
    ),
  );

  const errors = [...tune, ...test].filter((s) => (s.p >= t) !== s.replay);
  say(`Errors at ${t.toFixed(3)}: ${errors.length}`, "");
  if (errors.length > 0) {
    say(
      ...table(
        ["pair", "split", "category", "label", "p", "signals"],
        errors.map((s) => [
          s.pair.id,
          s.pair.split,
          s.pair.category,
          s.pair.label,
          s.p.toFixed(2),
          Object.entries(results[s.pair.id]!.runs[0]!.signals)
            .map(([k, v]) => `${k} ${v.toFixed(2)}`)
            .join(", "),
        ]),
      ),
    );
  }

  const slice = (name: string, items: Judged[]) => {
    const c = counts(items, t);
    const mean = (xs: Judged[]) => (xs.length ? f2(xs.reduce((s, x) => s + x.p, 0) / xs.length) : "–");
    return [name, items.length, c.wrongReplays, c.positives - c.kept, `${mean(items.filter((s) => s.replay))} / ${mean(items.filter((s) => !s.replay))}`];
  };
  const both = [...tune, ...test];
  const head = ["pairs", "n", "wrong replays", "unneeded re-records", "mean p: replay / re-record"];
  say(
    "By category (both splits):",
    "",
    ...table(
      head,
      [...new Set(both.map((s) => s.pair.category))].sort().map((c) => slice(c, both.filter((s) => s.pair.category === c))),
    ),
    "By condition (both splits):",
    "",
    ...table(head, [
      ...TAGS.map((tag) => slice(tag, both.filter((s) => s.pair.tags.includes(tag)))),
      slice("(none)", both.filter((s) => s.pair.tags.length === 0)),
    ]),
  );

  const repeated = Object.entries(results).filter(([, s]) => s.runs.length > 1);
  if (repeated.length > 0) {
    const spread = Math.max(...repeated.map(([, s]) => Math.max(...s.runs.map((r) => r.p)) - Math.min(...s.runs.map((r) => r.p))));
    const flips = repeated.filter(([, s]) => new Set(s.runs.map((r) => r.p >= t)).size > 1).map(([id]) => id);
    say(
      `Stability: ${repeated.length} pairs judged more than once; largest spread in p ${spread.toFixed(3)}; decisions that flip at ${t.toFixed(3)}: ${flips.length ? flips.join(", ") : "none"}.`,
      "",
    );
  }

  const runs = Object.values(results).flatMap((s) => s.runs);
  const tokens = runs.reduce((sum, r) => sum + r.inputTokens, 0);
  const price = pricePerMillion(judgeId);
  const failed = Object.entries(results).filter(([, s]) => s.error);
  say(
    `Cost and latency: ${runs.length} calls, p50 ${percentile(runs.map((r) => r.ms), 0.5) ?? "–"} ms, p95 ${percentile(runs.map((r) => r.ms), 0.95) ?? "–"} ms, ${tokens.toLocaleString()} input tokens${price === undefined ? "" : `, ~$${((tokens / 1e6) * price).toFixed(4)}`}.${failed.length ? ` Last run failed on ${failed.length} pairs (${failed[0]![1].error}).` : ""}`,
    "",
  );
}

// The whole ladder, as a user would see it
const ladder = pairs.filter((p) => p.label !== "unsure" && p.split === "test");
if (chosen.size > 0) {
  say(
    "## Matching ladder (test split)",
    "",
    "The hard checks run first, then the judge at its chosen threshold. Fail closed: a pair with no score re-records.",
    "",
    ...table(
      ["judge", "threshold", "wrong replays", "unneeded re-records (hard checks)", "unneeded re-records (judge)", "re-records avoided"],
      [...chosen].map(([judgeId, t]) => {
        let wrong = 0;
        let byChecks = 0;
        let byJudge = 0;
        let avoided = 0;
        for (const pair of ladder) {
          const p = hardCheck(pair).ok ? meanP(scores[judgeId]![pair.id]) : undefined;
          const replay = p !== undefined && p >= t;
          if (replay && pair.label === "rerecord") wrong++;
          if (replay && pair.label === "replay") avoided++;
          if (!replay && pair.label === "replay") {
            if (hardCheck(pair).ok) byJudge++;
            else byChecks++;
          }
        }
        const negatives = count(ladder, (p) => p.label === "rerecord");
        const positives = count(ladder, (p) => p.label === "replay");
        return [judgeId, t.toFixed(3), pct(wrong, negatives), pct(byChecks, positives), pct(byJudge, positives), pct(avoided, positives)];
      }),
    ),
  );
}

// Judges compared
const [a, b] = [...chosen.keys()];
if (a && b) {
  const both = judgeable.filter((p) => p.split === "test" && meanP(scores[a]![p.id]) !== undefined && meanP(scores[b]![p.id]) !== undefined);
  const decide = (judgeId: string, p: Pair) => (meanP(scores[judgeId]![p.id])! >= chosen.get(judgeId)! ? "replay" : "rerecord");
  const differ = both.filter((p) => decide(a, p) !== decide(b, p));
  say(
    `## ${a} vs ${b} (test split)`,
    "",
    `Same decision on ${pct(both.length - differ.length, both.length)} pairs, each at its own chosen threshold.`,
    "",
  );
  if (differ.length > 0) {
    say(
      ...table(
        ["pair", "label", a, b],
        differ.map((p) => [p.id, p.label, f2(meanP(scores[a]![p.id])), f2(meanP(scores[b]![p.id]))]),
      ),
    );
  }
}

const top = [
  "## Summary",
  "",
  `${reviewed}/${pairs.length} labels reviewed by a human; the rest are LLM drafts (docs/evals.md). Test split:`,
  "",
  ...summary,
  "",
];
mkdirSync(dirname(REPORT_FILE), { recursive: true });
writeFileSync(REPORT_FILE, `${[...md.slice(0, 4), ...top, ...md.slice(4)].join("\n").trimEnd()}\n`);
console.log([...md.slice(0, 2), ...top].join("\n"));
console.log(`Full report (errors, sweeps, categories, ladder): ${REPORT_FILE}`);
