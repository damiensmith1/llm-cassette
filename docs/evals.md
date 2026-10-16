---
title: Evals
tags: [llm-cassette, evals, jev]
status: draft
---

# Evals

How we measure the judge, so the replay threshold is chosen from data
rather than guessed. Labelling rules are in [[labelling]].

## What's measured

The judge decides whether a recorded reply can stand in for a real call
after a prompt edit. Two errors, with very different costs:

- **Wrong replay:** the judge replays a reply that's no longer valid. A
  stale answer passes silently. This is the error that matters.
- **Unneeded re-record:** the judge re-records when the reply was still
  fine. Costs one API call and some churn.

So the target is **zero wrong replays, then as many replays as possible**.
Reported per judge:

- **Wrong-replay rate** with a 95% upper bound (Wilson). With small
  samples the bound matters more than the rate: 0 errors in 39 pairs only
  shows the true rate is probably under 9%.
- **Replays kept:** the share of valid replays the judge allows.
- **AUC:** how well p separates the two kinds, independent of any
  threshold. 1 is perfect, 0.5 is a coin flip.

Two levels:

- **Component:** the judge alone, on pairs that pass the hard checks.
- **System (the matching ladder):** hard checks, then the judge at its
  threshold, fail closed. This is what a user sees, including what the
  conservative hard checks cost in unneeded re-records.

## Dataset

`eval/dataset/families/*.ts`, one file per **family**: a base recording
(request + reply) and 10–13 edits of it. Each edit is a set of exact
substitutions in the conversation text (`replace`) or a `patch` for tools
and settings; a substitution that misses or matches twice throws, so a typo
can't produce a no-op pair. Adding a family is adding a file.

Edits are tagged with a **category** (reword, cosmetic, added-met,
added-broken, input-edit, tools, …) and families with **conditions**
(long-prompt, structured, tools, multi-turn), so results can be sliced to
find where a judge is weak.

Each edit carries an LLM-drafted label and reason. Human labels in
`eval/dataset/labels.json` override drafts; see [[labelling]] for the
blind round and review.

## Splits

Families are split whole into **tune** and **test**, never individual
pairs. Edits of the same base prompt share its quirks (length, provider,
reply shape); splitting pairs at random would leak those quirks into test
and overstate how well the threshold generalises to new prompts. Each split
gets a long prompt, structured output and a tool-calling family.

Thresholds are chosen on tune only. Test is looked at once per decision;
choosing anything by looking at test turns it into a second tune set.

## Threshold choice

The lowest threshold with no wrong replays on tune (or at most
`--max-wrong-replay`), placed midway between the highest re-record score
and the next replay score above it, so it isn't sitting on one example.

## Running it

```sh
npm run eval:review -- --blind 30   # blind round, then agreement with the drafts
npm run eval:review                 # review the rest
npm run eval:run                    # judge every pair (needs .env keys; cached)
npm run eval:report                 # writes eval/results/report.md
```

`eval:run` caches scores in `eval/results/scores.json`, keyed by the pair,
its reply and the judge's id + question wording, and saves after every
call. Re-running is free; changing a prompt, a reply or the question
wording re-judges only what changed. `--repeats 3` judges each pair three
times and the report shows how far p moves. Not part of CI: it needs API
keys, and the scores are committed so the report runs without them.

## Results

Newest first. Each entry is a snapshot; the report regenerates from
`eval/results/scores.json`.

### 2026-10-16 · where things stand (Jev v2)

Full run: Jev v2 (2 runs a pair) and span-01-free v2 (re-judged, since
the version bump renamed it). At the current default 0.85, over **all**
143 scorable pairs, not just test (the report's summary is test-only, and
`weather-tool` is in tune):

| Jev at 0.85, all pairs | v1 | v2 |
|---|---|---|
| Broken replies replayed (wrong replays) | 1/78 (≤7%) | 1/78 (≤7%) |
| Valid replies kept | 49/65 (75%) | **53/65 (82%)** |

- **Good enough to stay the default judge.** One stale answer got through
  in 78 broken pairs; v2 removed all six `weather-tool` misses without
  adding a wrong replay.
- **The one wrong replay** is still `rag-answer/one-sentence` (p 0.91 in
  v2): "Answer in one sentence" was added and the reply has two.
  `format_changed` was 0.84 on it, the case for a veto (open question).
- **The remaining missed replays are mostly "a rule was added that the
  reply already meets":** `capital/in-french` (0.49), `translation/formal`,
  `informal-tu`, `canadian` (0.65–0.71), `prompt-tuner/at-most-five-gaps`,
  `fewer-options` (0.61–0.70). Jev gets cautious when a new constraint
  appears even if the reply satisfies it. That costs re-records, never
  correctness. Two more (`prompt-tuner/no-reveal` 0.83,
  `rag-answer/no-citations` 0.82) are noise at the line.
- **span-01-free is unchanged** (AUC 0.79 on test): the bump only renamed
  it. Still not usable as a replay judge.
- **Threshold:** 0.85 stays for now. The tuned thresholds (0.49–0.59)
  didn't hold on test, and the 0.85 numbers above were read with test in
  view, so they describe 0.85 but don't justify choosing it.
- **Trust:** synthetic pairs, LLM-made labels checked by a second LLM,
  78 broken pairs. The ≤7% upper bound is the honest number, not 1%.

### 2026-10-16 · question v2: tool calls

Hypothesis: Jev scores harmless edits of an OpenAI tool-call reply
(`weather-tool`) at ~0.3 because of how the reply reaches it. Tested one
cause at a time, each over all 146 judgeable pairs (~$0.007 a run):

1. **Tool-call arguments as a JSON string** (OpenAI sends
   `"{\"city\":\"Tokyo\"}"`). Parsed them into an object: no effect beyond
   noise (paraphrase 0.31 → 0.27). Reverted.
2. **The question wording.** `still_valid`'s true criterion ended "the
   recorded reply fully answers the new request", and a bare tool call is a
   step toward an answer, not the answer. Added "or, if it is a tool call,
   calling that tool with those arguments is still the right next step"
   (the guideline's rule 6). Harmless weather edits went from 0.28–0.37 to
   0.88–0.92 (mean of 2 runs each); broken ones stayed at 0.02–0.11;
   `calendar-tool`, whose reply also has text, didn't move. Kept as
   `QUESTION_VERSION` v2.

Test split at 0.85: v1 1/39 wrong replays, 24/28 kept; v2 1/39, 22/28.
The two v2 lost (`prompt-tuner/no-reveal`, `rag-answer/no-citations`) sit
at 0.82–0.87 in both versions, so that's noise at the line, not the
wording.

**Noise.** Jev isn't bit-exact. With `--repeats 2` back to back, p moved
a median 0.00 (90th percentile 0.03, max 0.11) on identical input; the
same inputs judged hours apart moved up to 0.21 (`sql/lowercase-keywords`
0.56 → 0.35). A change smaller than ~0.1 needs repeats before it means
anything.

### 2026-10-16 · Claude-drafted labels, checked by a second labeller

151 pairs, 13 families (81 tune, 70 test). 5 stopped by the hard checks,
3 unsure, 143 scored. Cost: ~$0.007 for Jev, span-01-free is free.

**Labels.** All 151 were drafted by Claude (Opus 5.5) while writing the
pairs. A human blind round was started, then dropped: after 13 pairs the
labeller didn't trust their own skimmed answers, and those labels were
discarded. (They showed the classic failure: 11/13 agreement but κ 0.43,
and two fast "replay" answers that contradict the guideline.)

Instead, a fresh Claude agent that had never seen the drafts labelled the
same 30-pair stratified sample, given only [[labelling]] and the pairs
(no categories or edit ids). Agreement with the drafts: **29/30, κ 0.93**.
The one disagreement, `multi-turn/vegan`, was settled for the second
labeller (draft unsure → replay, rule 7). Caveat: two labellers from the
same model family share blind spots, so this is weaker evidence than
human agreement. No pair has a human label.

| | Jev 1.13.0 | span-01-free |
|---|---|---|
| AUC tune / test | 0.99 / 0.99 | 0.87 / 0.79 |
| Threshold chosen on tune | 0.590 | 0.958 |
| Test wrong replays at that threshold | 3/39 (≤20%) | 0/39 (≤9%) |
| Test replays kept at that threshold | 28/28 | 0/28 |
| Test wrong replays at 0.85 | 1/39 (≤13%) | 10/39 (≤41%) |
| Test replays kept at 0.85 | 24/28 | 23/28 |

What it shows (provisional: the answer key is mostly an LLM's):

- **Jev separates well; span-01-free doesn't.** span-01-free scores
  many broken replies high (12 of 39 tune re-records at 0.85 or above),
  so the only threshold with no wrong replays (0.958) replays almost
  nothing. It isn't usable as a replay judge on this data.
- **The tune threshold didn't hold on test.** Jev scores harmless edits
  of an OpenAI tool-call reply (`weather-tool`) at 0.28–0.36, which drags
  the tune threshold down to 0.59; on test that lets 3 broken replies
  through. One family's quirk decided the threshold, and one label
  decides it too: settling `multi-turn/vegan` (p 0.62) as replay moved it
  from 0.605 to 0.590. Note the 0.85 numbers
  are read off test, so they can't be used to pick 0.85 either.
- **Jev is weak on OpenAI tool-call-only replies.** Same kind of edits on
  an Anthropic tool call (`calendar-tool`, which also has reply text)
  score 0.95+. Fixed by question v2 (above): the wording, not the
  formatting, was the cause.
- **The one test wrong replay at 0.85** (`rag-answer/one-sentence`,
  p 0.86) had `format_changed` 0.84. The diagnostic signals may catch what
  `still_valid` misses; this came from test, so it would need checking on
  new data.

## Open questions

- [ ] A human pass over at least the pairs where Jev and the label
      disagree (the report's error list), then re-run the report.
- [ ] Choose thresholds with leave-one-family-out cross-validation instead
      of a single tune/test split. With 13 families, one family's quirk
      (weather-tool) moves the threshold a lot.
- [ ] Whether a high `format_changed` should veto a replay.
- [ ] span-01-pro once there are credits.
- [ ] Constraint-already-met edits are the main source of missed replays.
      A question or criterion tweak for them is the next efficiency win;
      it needs new pairs to check, since these came from the current set.
- [ ] Mine real prompt edits from git history (prompt-tuner, jevfilter) as
      a family that wasn't written for the eval.
