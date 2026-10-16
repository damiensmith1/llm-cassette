---
title: Labelling guideline
tags: [llm-cassette, evals]
status: draft
---

# Labelling guideline

Labels are the answer key for the judge eval (see [[evals]]). Each pair is
a recording (the old request and the reply it got) plus an edited request.
Two people following this page should give the same label without talking
to each other. Where they don't, fix this page.

## The question

**Is the recorded reply still a correct and appropriate reply to the new
request?**

- `replay`: yes. Someone reading the new request would accept this reply
  as the answer, with nothing missing, wrong, or in the wrong form.
- `rerecord`: no.
- `unsure`: reasonable people would disagree, or it depends on facts you
  can't check.

This is the question the judges are asked (`still_valid` in
`src/match/jev.ts`). If that wording changes, revisit this page.

What it is not:
- **Not "would a fresh call return the same text?"** Models vary. A
  different but equivalent reply is fine; the question is whether the
  recorded one is acceptable.
- **Not "is the reply good?"** Assume the reply was right for the old
  request. Judging quality is a non-goal ([[requirements]]).
- **Not "would the test still pass?"** You don't know what the test
  asserts. Judge against the request only.

## Rules

Take the first one that applies.

1. **Same meaning, different words** (rewording, typos, casing,
   whitespace, reordering independent instructions): `replay`.
2. **Asks about something else** (a different entity, date, number,
   amount, or a different task): `rerecord`, unless the correct reply is
   clearly identical (a different review that is still "mixed").
3. **The input material changed** (the email, document, code or data the
   reply works from): `rerecord` if the reply states, uses or depends on
   the changed part; `replay` if it doesn't (an edited email signature the
   summary never mentions).
4. **A new or changed requirement:**
   - the reply breaks it (format, length, language, casing, structure, a
     field or element it lacks, something it must not contain):
     `rerecord`
   - the reply already meets it ("be concise" for a one-word reply,
     "at most five" when it has four): `replay`
   - you can't tell whether it meets it: `unsure`
5. **A removed or loosened requirement:** `replay`, unless the reply now
   contains something the new request makes wrong.
6. **Tools.** A tool call is the reply. `replay` only if the same call,
   with the same arguments, is still the right next step. Adding a tool the
   reply doesn't need, or rewording a description without changing what
   the tool does, is `replay`. A description change that makes the call
   wrong is `rerecord`.
7. **Earlier conversation turns.** An edit to an earlier turn matters only
   if the final reply depends on it.
8. **Audience, persona, tone.** `rerecord` if the reply clearly doesn't
   fit the new audience; `replay` if it's neutral enough to fit both;
   otherwise `unsure`.
9. **Changes the hard checks catch** (model, settings, structured output
   spec, a called tool's schema): label them by the question like any
   other pair. They never reach the judge, but they measure what the
   conservative hard checks cost.

## Unsure

Use it honestly instead of forcing a call. Typical cases: contested or
time-dependent facts ("the capital of France in 1940"), conflicting
instructions, or a requirement you can't check from the reply. `unsure`
pairs are left out of scoring and listed in the report. If more than about
10% of pairs end up `unsure`, this page needs work.

## Worked examples

Base: system `Answer in one word.`, user `What is the capital of France?`,
reply `Paris`.

| Edit | Label | Rule |
|---|---|---|
| user → `what is the capital of france` | replay | 1 |
| user → `What is the capital of Germany?` | rerecord | 2 |
| system → `Answer in one word. Be concise.` | replay | 4, already met |
| system → `Answer in one word, in lowercase.` | rerecord | 4, broken |
| system → `Answer in one word, in French.` | replay | 4, "Paris" is French too |
| system → `Answer the question.` | replay | 5 |
| user → `What was the capital of France in 1940?` | unsure | contested fact |
| `temperature` set to 0.2 | replay | 9; the hard checks re-record it anyway |

## Process

1. **Draft.** An LLM (Claude) drafts a label and a one-sentence reason for
   each pair, stored next to the pair in `eval/dataset/families/`.
2. **Blind round.** `npm run eval:review -- --blind 30` shows a sample
   across categories *without* the draft. Your labels are compared with
   the drafts (agreement and Cohen's κ). Each disagreement means the
   guideline, the draft or your label is wrong; fix the cause, not only
   the label.
   Without a human, a second LLM labeller can stand in: a fresh agent
   that has never seen the drafts, given only this page and the pairs
   (no categories or edit ids, which give answers away). Weaker evidence,
   since two models from one family share blind spots.
3. **Review.** `npm run eval:review` walks every remaining pair with the
   draft shown. Accept it or override it, with a note when you override.
4. **The human label wins.** Labels live in `eval/dataset/labels.json`.
   The report says how many pairs are still draft-only.
5. **When this page changes,** re-check the labels the change affects
   (`--redo <pair id>`).
