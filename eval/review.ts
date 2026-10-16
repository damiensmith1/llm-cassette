/**
 * Label pairs by hand; see docs/labelling.md. Labels are saved after every
 * answer to eval/dataset/labels.json, so you can stop and resume any time.
 *
 *   npm run eval:review -- --blind 30          blind round: drafts hidden, then agreement
 *   npm run eval:review                        every unlabelled pair, draft shown
 *   npm run eval:review -- --family sql        one family only
 *   npm run eval:review -- --redo capital/germany --redo sql/mysql
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { canonicalJson } from "../src/normalize/canonical.js";
import { finalBody } from "../src/normalize/stream.js";
import { diffJson, textFields } from "../src/match/diff.js";
import { flattenResponse } from "../src/match/jev.js";
import { toSpanInput } from "../src/match/span.js";
import { blindAgreement, hardCheck, loadDataset, readLabels, writeLabels } from "./lib/dataset.js";
import type { Pair } from "./lib/dataset.js";
import { stratifiedSample } from "./lib/metrics.js";
import type { Label } from "./lib/types.js";

const { values } = parseArgs({
  options: {
    blind: { type: "string" },
    family: { type: "string" },
    redo: { type: "string", multiple: true },
  },
});

const tty = process.stdout.isTTY;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const [red, green, dim, bold] = [paint(31), paint(32), paint(2), paint(1)];
const show = (v: unknown) => (typeof v === "string" ? v : canonicalJson(v ?? null));
const indent = (s: string, prefix: string) => s.split("\n").map((line) => `${prefix}${line}`).join("\n");

const KEYS: Record<string, Label> = { r: "replay", x: "rerecord", u: "unsure" };

/** Long messages (a 4k-char system prompt) show their start; `f` shows all of it. */
const clip = (s: string, max = 400) => (s.length <= max ? s : `${s.slice(0, max)}${dim(` … [${s.length} chars, f for full]`)}`);

function print(pair: Pair, n: number, total: number, blind: boolean) {
  // Categories ("added-broken") and edit ids ("harmless-reword") give the answer away, so blind mode hides them.
  const name = blind ? pair.family : `${pair.id} · ${pair.category}`;
  console.log(`\n${bold(`── ${n}/${total} · ${name}`)} ${dim(`· ${pair.split}`)}`);
  console.log(bold("\nNew request"));
  for (const m of toSpanInput(pair.next.provider, pair.next.body)) {
    const pad = " ".repeat(m.role.length + 1);
    console.log(clip(m.content).split("\n").map((line, i) => `  ${i === 0 ? dim(`${m.role}:`) : pad} ${line}`).join("\n"));
  }
  console.log(bold("\nWhat changed"));
  for (const c of diffJson(pair.old.body, pair.next.body, "", "sentence")) {
    console.log(dim(`  ${c.path}`));
    if (c.before !== null) console.log(red(indent(show(c.before), "  - ")));
    if (c.after !== null) console.log(green(indent(show(c.after), "  + ")));
  }
  const check = hardCheck(pair);
  if (!check.ok) console.log(dim(`  (the hard checks stop this one before the judge: ${check.reason})`));
  const reply = flattenResponse(pair.next.provider, finalBody(pair.next.provider, pair.response));
  console.log(bold("\nRecorded reply"));
  if (reply.text) console.log(indent(reply.text, "  "));
  for (const call of reply.tool_calls) console.log(indent(`tool call: ${show(call)}`, "  "));
  if (!blind) console.log(`\n${bold(`Draft: ${pair.draft}`)} ${dim(`· ${pair.why}`)}`);
}

const pairs = await loadDataset();
const labels = readLabels();
const blind = values.blind !== undefined;
const inScope = pairs.filter((p) => !values.family || p.family === values.family);
// The blind sample is drawn from every pair, so a restarted round resumes the same sample.
const queue = values.redo
  ? pairs.filter((p) => values.redo!.includes(p.id))
  : (blind ? stratifiedSample(inScope, (p) => p.category, Number(values.blind)) : inScope).filter((p) => !labels[p.id]);

if (queue.length === 0) {
  console.log("Nothing to label.");
} else {
  console.log(
    blind
      ? `Blind round: ${queue.length} pairs, drafts hidden. Label each by docs/labelling.md.`
      : `${queue.length} pairs to review. Enter accepts the draft.`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const keys = `r replay · x re-record · u unsure${blind ? "" : " · enter accept draft"} · f full request · s skip · q quit`;
  let quit = false;
  for (const [i, pair] of queue.entries()) {
    print(pair, i + 1, queue.length, blind);
    let label: Label | undefined;
    while (!label && !quit) {
      const answer = (await rl.question(dim(`\n${keys}\n> `))).trim().toLowerCase();
      if (answer === "q") quit = true;
      else if (answer === "s") break;
      else if (answer === "f") console.log(indent(canonicalJson(textFields(pair.next), 2), "  "));
      else if (answer === "" && !blind) label = pair.draft;
      else label = KEYS[answer];
    }
    if (quit) break;
    if (!label) continue;
    const note = !blind && label !== pair.draft ? (await rl.question(dim("note on why (optional): "))).trim() : "";
    labels[pair.id] = { label, blind, ...(note ? { note } : {}), at: new Date().toISOString() };
    writeLabels(labels);
  }
  rl.close();
}

const after = await loadDataset();
console.log(`\nLabelled by you: ${after.filter((p) => p.human).length}/${after.length}`);
const agreement = blindAgreement(after);
if (blind && agreement.n > 0) {
  console.log(bold(`Blind agreement with the drafts: ${agreement.agreed}/${agreement.n}, Cohen's κ ${agreement.kappa?.toFixed(2)}`));
  for (const p of agreement.disagreements) {
    console.log(`  ${p.id}: you ${p.human!.label}, draft ${p.draft} ${dim(`(${p.why})`)}`);
  }
  console.log(dim("Each disagreement is a guideline, draft or label to fix. Then: npm run eval:review"));
}
