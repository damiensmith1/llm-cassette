---
title: Requirements
tags: [llm-cassette, requirements]
status: draft
---

# Requirements

See [[background]] for why, and [[design]] for how.

## Users
- TypeScript developers whose code calls OpenAI or Anthropic and who want
  fast, free, deterministic tests that don't break on every prompt edit.
- The author's own repos are the first users. Good TS candidates include
  prompt-tuner and fraude-code.

## Functional: MVP
1. **Zero-code interception.** Capture OpenAI and Anthropic SDK calls made
   through global `fetch` without changing app code.
2. **Per-client escape hatch.** Export a `cassetteFetch()` to pass as the
   SDK's `fetch` option, for users who don't want global patching and for
   `test.concurrent`.
3. **Vitest integration.** A fixture or plugin that gives each test its
   own cassette. The path comes from the test file and name, e.g.
   `__cassettes__/<file>/<test>.json`.
4. **Modes:**
   - `replay`: no network. Fail on a miss or a missing verdict. The
     default in CI.
   - `record`: call the API on a miss.
   - `refresh`: re-record everything.
5. **Matching ladder:** exact → scrubbed → hard code checks → Jev judgment.
   See [[design]].
6. **Stored verdicts.** Every Jev verdict is written to the cassette, and
   replay reads it without calling Jev.
7. **Redaction.** Auth headers (`authorization`, `x-api-key`) are never
   written to disk.
8. **Run report.** Counts of exact, scrubbed, judged (with p values),
   re-recorded and failed matches, with a reason for each miss.
9. **Streaming.** SSE responses record as a readable event list and replay
   as a stream (done; optional timing is post-MVP).
10. **Multi-turn.** A test can make several calls, e.g. a tool-calling
   loop. They are recorded as a sequence.

## Functional: after MVP
- Jest adapter.
- msw adapter.
- aimock-compatible fixture import or export.
- A PR comment summarising the report in CI.
- Review-gated re-record: a PR that re-records shows diffs and never
  auto-accepts.

## Non-functional
- **Deterministic in CI.** Replay mode never touches the network,
  including Jev. It needs no API keys.
- **Fail closed.** If Jev is unreachable or a verdict is missing in
  replay mode, re-record or fail. Never replay silently.
- **Readable cassettes.** Pretty JSON with sorted keys, so they diff
  cleanly in PRs. No base64 blobs for text.
- **Parallel-safe.** Safe across Vitest workers: one file per test and
  atomic write-then-rename.
- **Cheap.** Jev is called only for near-misses in record/refresh mode.
- **Node 22+.** ESM and CJS, fully typed. (Node 20 reached end of life in
  April 2026, and `@mswjs/interceptors` 0.42+ requires 22.)

## Non-goals
- Judging output quality. That's what eval frameworks are for.
- A production cache or gateway.
- Mocking MCP, vector DBs or search (aimock covers these).
- Providers beyond OpenAI and Anthropic in the MVP.
- Python in v1.

## Success metrics
- Wrong-replay rate on a labeled set of prompt edits (target: set after
  the first eval).
- Re-records avoided and CI time/dollars saved on the author's own repos.
- **Gap:** no user-adoption target set yet.
