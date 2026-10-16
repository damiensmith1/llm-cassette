import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalize, canonicalJson } from "../../src/normalize/canonical.js";
import { TEXT_FIELDS } from "../../src/normalize/providers.js";
import { hardChecks } from "../../src/match/hardChecks.js";
import type { CheckResult } from "../../src/match/hardChecks.js";
import type { RecordedRequest, RecordedResponse } from "../../src/types.js";
import { cohensKappa } from "./metrics.js";
import type { Category, Edit, Family, Label, Split, Tag } from "./types.js";

export const EVAL_DIR = fileURLToPath(new URL("..", import.meta.url));
const FAMILIES_DIR = join(EVAL_DIR, "dataset", "families");
export const LABELS_FILE = join(EVAL_DIR, "dataset", "labels.json");
export const SCORES_FILE = join(EVAL_DIR, "results", "scores.json");
export const REPORT_FILE = join(EVAL_DIR, "results", "report.md");

export interface HumanLabel {
  label: Label;
  /** Labelled without seeing the draft, so it counts toward agreement. */
  blind: boolean;
  note?: string;
  at: string;
}

export interface Pair {
  /** `family/edit`, stable across runs. */
  id: string;
  family: string;
  split: Split;
  tags: readonly Tag[];
  category: Category;
  old: RecordedRequest;
  next: RecordedRequest;
  response: RecordedResponse;
  draft: Label;
  why: string;
  human?: HumanLabel;
  /** The answer key: the human label when there is one, else the draft. */
  label: Label;
}

export function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}

/** Sorted keys for stable diffs; write-then-rename so a crash never leaves half a file. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${canonicalJson(value, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

export const readLabels = () => readJson<Record<string, HumanLabel>>(LABELS_FILE, {});
export const writeLabels = (labels: Record<string, HumanLabel>) => writeJson(LABELS_FILE, labels);

/** Replaces `from` in every string inside `value`, reporting how many it found. */
function replaceIn(value: unknown, from: string, to: string, found: (n: number) => void): unknown {
  if (typeof value === "string") {
    const parts = value.split(from);
    if (parts.length > 1) found(parts.length - 1);
    return parts.join(to);
  }
  if (Array.isArray(value)) return value.map((v) => replaceIn(v, from, to, found));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceIn(v, from, to, found)]));
  }
  return value;
}

/** The edited request. Throws if a substitution misses or hits twice, so a typo can't make a no-op pair. */
export function applyEdit(family: Family, edit: Edit): RecordedRequest {
  const body = structuredClone(family.request.body) as Record<string, any>;
  for (const [from, to] of edit.replace ?? []) {
    let hits = 0;
    for (const field of TEXT_FIELDS[family.request.provider]) {
      if (field in body) body[field] = replaceIn(body[field], from, to, (n) => (hits += n));
    }
    if (hits !== 1) {
      throw new Error(`${family.id}/${edit.id}: expected ${JSON.stringify(from)} once in the conversation text, found it ${hits} times`);
    }
  }
  edit.patch?.(body);
  return { ...family.request, body: canonicalize(body) };
}

/** Every family file in eval/dataset/families/. */
export async function loadFamilies(): Promise<Family[]> {
  const files = readdirSync(FAMILIES_DIR).filter((f) => f.endsWith(".ts")).sort();
  return Promise.all(files.map(async (f) => (await import(pathToFileURL(join(FAMILIES_DIR, f)).href)).default as Family));
}

export async function loadDataset(): Promise<Pair[]> {
  const labels = readLabels();
  const pairs: Pair[] = [];
  for (const family of await loadFamilies()) {
    const old = { ...family.request, body: canonicalize(family.request.body) };
    for (const edit of family.edits) {
      const id = `${family.id}/${edit.id}`;
      if (pairs.some((p) => p.id === id)) throw new Error(`duplicate pair id ${id}`);
      const next = applyEdit(family, edit);
      if (canonicalJson(next.body) === canonicalJson(old.body)) throw new Error(`${id}: the edit changes nothing`);
      const human = labels[id];
      pairs.push({
        id,
        family: family.id,
        split: family.split,
        tags: family.tags,
        category: edit.category,
        old,
        next,
        response: family.response,
        draft: edit.draft,
        why: edit.why,
        ...(human ? { human } : {}),
        label: human?.label ?? edit.draft,
      });
    }
  }
  return pairs;
}

/** Rung 3 of the matching ladder: pairs that fail never reach the judge. */
export const hardCheck = (pair: Pair): CheckResult =>
  hardChecks({ request: pair.old, response: pair.response, recordedAt: "" }, pair.next);

/** Human vs draft on pairs labelled blind. */
export function blindAgreement(pairs: readonly Pair[]) {
  const blind = pairs.filter((p) => p.human?.blind);
  const disagreements = blind.filter((p) => p.human!.label !== p.draft);
  return {
    n: blind.length,
    agreed: blind.length - disagreements.length,
    kappa: cohensKappa(blind.map((p) => [p.human!.label, p.draft] as const)),
    disagreements,
  };
}
