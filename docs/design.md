---
title: Design
tags: [llm-cassette, design, jev]
status: draft
---

# Design

Implements [[requirements]]. Context in [[background]].

## Architecture

```
core
  ├─ intercept   @mswjs/interceptors (global) | cassetteFetch() (per client)
  ├─ normalize   canonical request, volatile fields scrubbed, secrets redacted
  ├─ match       exact → scrubbed → hard checks → Jev judge
  ├─ cassette    read/write per-test JSON, atomic writes
  └─ report      per-run summary
adapters
  ├─ vitest      (MVP)
  ├─ jest        (later)
  └─ msw         (later)
```

## Interception
- Both SDKs (openai-node, @anthropic-ai/sdk) are Stainless-generated. They
  use **global `fetch`** and accept `fetch?: Fetch` in the constructor.
- **They capture `fetch` when the client is constructed**
  (`this.fetch = options.fetch ?? getDefaultFetch()`). A module-level
  `export const openai = new OpenAI()` is built at import time, before any
  test fixture runs, so patching `globalThis.fetch` in a fixture would miss
  it.
- **Decided:** global capture uses `HttpRequestInterceptor` from
  `@mswjs/interceptors` (v0.45), which intercepts at the socket level and
  so catches those clients too (`src/intercept/global.ts`). Only hosts in
  `hosts` (default `api.openai.com`, `api.anthropic.com`) go through the
  cassette; everything else passes through.
  - The `request` listener calls `session.resolve()`: replay or miss →
    `respondWith`; record → no response, so the request goes to the real
    API, and the `response` event (type `original`) hands the real
    response to `session.record()`. `save()` awaits in-flight recordings.
  - **Compression (bug found in the field test):** socket-level
    interception sees raw bytes, still gzip/br-compressed, while `fetch`
    decodes them for the app. The first prompt-tuner recordings stored
    garbled bodies (JSON replayed as a 500; the stream parsed to zero
    events). Fix: requests being recorded get `accept-encoding: identity`,
    and `decodeBody()` (`src/intercept/encoding.ts`) decodes gzip, deflate,
    br and zstd in case a server compresses anyway. The `session.fetch`
    path doesn't need this (undici has already decoded).
  - Calling native `fetch` from inside the listener would be intercepted
    again, which is why recording uses passthrough + the response event.
  - v0.45's `FetchInterceptor` in Node is also socket-level; it doesn't see
    a stubbed `globalThis.fetch`, so tests use a local HTTP server.
- The Anthropic SDK also has a `middleware` option (since 0.101.0). It's a
  possible cleaner hook later.
- Only one session may intercept per process at a time; a second one
  throws. `test.concurrent` within one file can't attribute requests to a
  test, so those tests pass `session.fetch` to the client (or, later,
  AsyncLocalStorage — see open questions).

## Normalization
- Request headers are never recorded or compared (see Session below):
  that covers `X-Stainless-*`, idempotency keys, user-agent and auth.
- **Response headers are allowlisted (decided after the prompt-tuner field
  test):** only `content-type`, `retry-after` and `x-should-retry` are
  recorded (`KEEP_HEADERS` in `src/normalize/response.ts`). Real Anthropic
  responses carry `anthropic-organization-id` and `anthropic-workspace-id`,
  which identify the account and mustn't land in public repos, plus dates,
  rate limits, request ids and Cloudflare headers that are pure noise.
  Body volatiles (ids, `created`) are stored but never compared.
- Canonical JSON (sorted keys) is used for hashing.
- **Scrubbing (implemented, `src/normalize/scrub.ts`).** The second rung.
  When there's no exact match, both the new request and each recording are
  compared after:
  - replacing ISO-8601 dates/datetimes and UUIDs in every string with
    `<scrubbed>`;
  - dropping caller-identity top-level fields `user` and `metadata`.

  Decisions: on by default; user `patterns` / `ignoreFields` are *added* to
  the defaults; `scrub: false` turns it off. Scrubbing runs at match time on
  both sides and is never written to disk, so a new rule also applies to
  old cassettes. Numbers are never scrubbed (too likely to be meaningful,
  e.g. `max_tokens`). A scrubbed hit replays and is reported as `scrubbed`.

## Session and `fetch` (implemented)

`openCassette(path, { mode, provider?, fetch? })` in `src/session.ts` returns
a session whose `fetch` is passed to the SDK (`new OpenAI({ fetch })`).
Decisions:
- **Mode default:** explicit option → `LLM_CASSETTE_MODE` → `replay` when
  `CI` is set, else `record` (`src/config.ts`). `record` replays matches and
  records misses (VCR's `new_episodes`); `refresh` starts from an empty
  cassette.
- **Request headers are never recorded** — not redacted, dropped. They hold
  the API key and per-run noise, and aren't part of the match key. Response
  `set-cookie`, `content-length` and encoding headers are dropped too.
- **Repeated identical requests** replay in recorded order; each recording
  is used once per session.
- **Misses in `replay` return an HTTP 400** (`x-should-retry: false`,
  `x-llm-cassette: miss`) instead of throwing. Both SDKs wrap thrown fetch
  errors as a generic "Connection error" and retry them, which hid the
  message. The miss is also recorded in `session.events`, so the Vitest
  adapter can fail the test even if app code catches the error.
- **Streaming:** stored as parsed SSE events (see Streaming below).
- Provider is detected from the URL (`/messages` → anthropic, else openai),
  overridable for proxies.

## Matching ladder
1. **Exact.** Hash the canonical request. On a hit, replay. Free.
2. **Scrubbed.** Apply the scrubbers, hash, and replay on a hit.
3. **Hard checks, in code (implemented, `src/match/hardChecks.ts`).** Any
   failure means re-record (or fail in `replay` mode, with the reason in the
   error). Jev is only consulted if every check passes. Decided rules —
   conservative on purpose, since a wrong replay is worse than a re-record:
   - **Endpoint and model** must match.
   - **Settings:** every body field outside the conversation text must
     match exactly. Text fields are `messages` + `tools` (OpenAI) and
     `messages` + `system` + `tools` (Anthropic); scrubber `ignoreFields`
     are skipped. This covers temperature, max_tokens, `response_format`,
     `tool_choice`, `stream` and anything new. Jev is weak at numbers.
   - **Structured output:** any change to the format spec rejects (it's a
     setting). Simpler and safer than validating the recorded JSON against
     the new schema, which the original draft proposed.
   - **Tools:** for each tool the recorded reply *called*, the tool must
     still exist and its argument schema must be unchanged. Description
     edits and changes to tools that weren't called go to Jev. This replaces
     validating the recorded args against the new schema, so no JSON Schema
     validator dependency.
   - **Images, audio, files:** any change to non-text message parts rejects.
     Jev reads text only.
   - **Unreadable recordings** (e.g. legacy raw-SSE text, unknown stream
     shapes) are rejected; streamed recordings are reassembled first.

   **Candidate (decided, `src/match/candidate.ts`):** the unused recording
   at the same position in the session's call sequence if it hits the same
   endpoint, else the first unused one for that endpoint.
4. **Jev judgment (implemented, `src/match/jev.ts`, `src/match/diff.ts`).**
   Runs on the rung-3 candidate once every hard check passes. State sent to
   Jev, only the conversation-text fields:
   ```
   old_request, new_request, diff (computed in code), recorded_response (flattened text + tool calls)
   ```
   - String edits in the diff are trimmed to the changed span plus 300
     chars of context each side, so a one-word edit in a long prompt is
     small.
   - If the state exceeds ~100k chars (Jev's 32k-token state limit), only
     `diff` + `recorded_response` are sent; if that's still too big, it
     can't be judged and re-records.

   Questions, all asked in one call:
   - `still_valid` (primary Noul): "Would `recorded_response` be a correct
     and appropriate reply to `new_request`, given the changes in `diff`?"
     Its true/false criteria are spelled out explicitly.
   - `format_changed`, `asks_different_task`: diagnostic Nouls shown in the
     rejection reason.

   Replay if `still_valid ≥ threshold` (reported as `judged` with p).
   Otherwise re-record, or fail in `replay` mode (reported as `rejected`).
   The judge is pluggable (`judge` option, `Judge` interface); `judge: false`
   makes every text edit re-record.
5. **Miss.** Re-record in `record` mode, fail in `replay` mode.

**First live check (2026-10-01, jev-1.13.0):** paraphrase of "capital of
France" p=0.99; France → Germany p=0.02 (`asks_different_task` 0.62);
"…reply in JSON" p=0.10 (`format_changed` 0.82). `test/jev.live.test.ts`
(now `test/judges.live.test.ts`) runs these when the judge's key is set
or in `.env`; skipped in CI.

### Stored verdicts (implemented)
- Key: sha256 of (canonical old request, canonical new request, judge id
  = pinned model + question version, question text + criteria).
- Stored: p, diagnostic signals, threshold at the time, the model version
  Jev reported, the judge id. Rejections are stored too.
- **The current threshold is applied to stored p**, so raising the
  threshold takes effect in `replay` without re-judging.
- In `replay` mode verdicts are only read; the judge (and its API key) is
  never touched. A missing verdict fails with "no stored verdict".
- **Fail closed:** no verdict in replay, no API key, a Jev error or an
  oversized request never replays — it re-records (record mode) or fails.
- **Judge setup check (decided):** judges may expose `setupProblem()`; a
  missing key is reported as "the judge can't run: TYPESAFE_API_KEY is not
  set. Set it, or pass judge: false" instead of an API error, and the
  judge isn't called. Judging is not silently skipped.
- **Per-judge thresholds (decided):** judges may carry a `threshold`
  (`createJevJudge({ threshold })`). Precedence: session option →
  `LLM_CASSETTE_THRESHOLD` → judge → 0.85. Both built-in judges default to
  0.85 until the labeled set gives a reason to differ.
- **Superseding (decided):** when a candidate is rejected and its
  replacement is recorded, the old recording and its verdict are removed
  on save, so cassettes don't accumulate stale entries. Other unused
  recordings are kept (a test that failed midway shouldn't lose them).

### span-01 judge (implemented, `src/match/span.ts`)
`createSpanJudge({ model, apiKey })`, Respan's span-01 classifier via
`POST https://api.respan.ai/api/v1/scores` (`RESPAN_API_KEY`). Opt-in; Jev
stays the default. Models: `span-01-pro` (default, $0.02/1M input, needs
Respan credits) and `span-01-free` (daily cap).
- **Input:** span-01 reads one reply in the context of text messages. It
  gets the *new* request flattened to text (system, a tool list, messages,
  tool calls and results as `[tool call …]` text) as `span.input`, the
  recorded reply as `span.output`, and a final system note quoting what
  changed ("Before: … / Now: …").
- **Decided after field testing (2026-10-03):**
  - Asking "is the reply correct?" (`still_valid`) failed: on prompt-tuner's
    long system prompt and JSON review, span-01 said p=0.05 even for the
    *unedited* request, while its own `format_mismatch`/`off_task` said
    nothing was wrong. It detects failures well and affirms correctness
    badly, so the primary behavior is `breaks_change` and
    **p(valid) = p_absent** (`p_not_observable` counts against replay).
  - Without the change note it couldn't find a one-sentence change in a
    4k-char system prompt (scored the same with and without the edit).
  - The note quotes **whole sentences** (`requestDiff(…, "sentence")`). With
    300 chars of context the harmless rewording scored 0.15 and the real
    change 0.47 (backwards); with sentences, 0.91 and 0.45. Jev keeps the
    300-char window, which works for it.
- **Results** (threshold 0.85):

  | Case | Jev 1.13.0 | span-01-free |
  |---|---|---|
  | Paraphrase of the question | 0.99 | 0.95 |
  | System prompt reworded | 0.99 | 0.95 |
  | France → Germany | 0.02 | 0.08 |
  | "Reply in JSON" | 0.09 | 0.03 |
  | "Answer in a full sentence" | 0.04 | 0.02 |
  | prompt-tuner: harmless rewording | 0.96 | 0.91 |
  | prompt-tuner: "at most one gap" | 0.04 | 0.45 |

  Both judge every case correctly; span-01 has less margin on long, real
  prompts (0.91 vs 0.85, 0.45). `span-01-pro` is untested (needs credits).

## Jev integration
- `@typesafe-ai/sdk` v0.6 (`TypeSafeClient().systemOne({state, questions,
  model})`, `noul(...)`). The key comes from `TYPESAFE_API_KEY`.
- **Pin `jev-1.13.0`.** The `jev-latest` alias moves.
- Freeze and version the question wording. In [[semantic-pubsub-jev]],
  wording alone moved 23.8% of decisions.
- Limits: 32k tokens for state plus the longest question, 64k per request.
  Trim unchanged context down to the diff plus a window around it.
- Recorded prompts contain instructions, which is an injection risk. Keep
  them inside named data fields and make the criteria explicit.
- Cost and latency: about $0.042 per million input tokens, so a 4k-token
  judgment costs about $0.0002. Around 200–300ms.

## Cassette format (draft)

Implemented in `src/cassette/store.ts`: saved as sorted-key JSON, 2-space
indent, trailing newline; written to a temp file then renamed (atomic).
A missing file loads as an empty cassette; an unknown `version` is an error.

```jsonc
{
  "version": 1,
  "interactions": [
    {
      "request":  { "provider": "anthropic", "url": "...", "body": { /* canonical */ } },
      "response": { "status": 200, "headers": { }, "body": { }, "events": null /* or [{ "event"?, "data" }] for streams */ },
      "recordedAt": "2026-09-28T00:00:00Z"
    }
  ],
  "verdicts": [
    { "key": "sha256…", "model": "jev-1.13.0", "judge": "jev-1.13.0:v1",
      "p": 0.94, "signals": { "format_changed": 0.03 }, "threshold": 0.85, "replay": true }
  ]
}
```

## Streaming (implemented, `src/normalize/stream.ts`)
- Responses with `content-type: text/event-stream` are stored as a parsed
  event list in `response.events` (`{ event?, id?, data }`, with `data`
  parsed as JSON when it is JSON, e.g. OpenAI's `[DONE]` stays a string);
  `response.body` is null. Comment lines are dropped; Anthropic `ping`s and
  `error` events are kept. Readable and diffable in PRs.
- Replay re-serializes the events and serves them as a `ReadableStream`,
  one event per chunk, with the recorded headers. Both SDKs' stream helpers
  are tested (`for await` on OpenAI, `messages.stream().finalMessage()` on
  Anthropic), directly and through global interception.
- **Judging streamed recordings:** `finalBody()` reassembles the events
  into the body a non-streamed call would return (OpenAI chunk deltas incl.
  tool-call args; Anthropic content blocks incl. `input_json_delta`), so
  hard checks and Jev read them like any other recording. Unknown stream
  shapes (e.g. OpenAI's Responses API) can't be read and re-record.
- **Not done:** inter-chunk timing isn't recorded (replay streams as fast
  as it's read), so UI/abort timing can't be tested yet. Recordings from
  before this change (raw SSE text in `body`) still replay byte for byte
  but can't be judged. See [[Streaming Architecture in Node.js]].

## Vitest integration
- `@damiensmith1/llm-cassette/vitest` exports `test` / `it` (and `createTest(options)`
  for `mode`, `provider`, `hosts`). An **auto** `cassette` fixture runs for
  every test, so no setup file and no destructuring is needed; tests that
  make no LLM calls write nothing.
- The fixture opens the session, starts global interception, runs the
  test, stops interception and saves. **Any replay miss fails the test**
  after it runs, even if app code caught the SDK error.
- **Decided:** path is `<test dir>/__cassettes__/<test file>/<slug>.<hash8>.json`
  (`src/cassette/path.ts`). The slug is the lowercased name chain, capped at
  80 chars; the 8-char hash of the full chain stops two tests whose names
  slug the same from sharing a cassette.
- Mode comes from an env var (`LLM_CASSETTE_MODE`), with CI defaulting to
  `replay`.
- Vitest workers are separate processes/isolates, so interception per
  worker is safe across files.

## Run report (implemented)
- Core (`src/report/summary.ts`) is runner-agnostic: `summarize()` and
  `formatSummary(summary, detail)`.
- **Decided:** in Vitest, the fixture attaches a serializable `TestReport`
  to `task.meta.llmCassette` (only for tests that made LLM calls), and a
  separate reporter, `@damiensmith1/llm-cassette/vitest/reporter`, collects it in the
  main process via `onTestCaseResult` and prints at `onTestRunEnd`. That's
  the only way to aggregate across Vitest workers without IPC of our own.
  Users opt in by adding it to `reporters`.
- All settings and their env vars are listed in [[configuration]].
- This repo's own `vitest.config.ts` uses the reporter.

## Build order

1. [x] Cassette store + canonical hashing
2. [x] Exact replay through `openCassette().fetch`
3. [x] Global interception (`@mswjs/interceptors`) + Vitest fixture
4. [x] Scrubbing rules
5. [x] Hard checks
6. [x] Jev judge + stored verdicts
7. [x] Run report
8. [x] Streaming as parsed SSE events

## Field test: prompt-tuner (2026-10-03)

First run against a real app: two Vercel edge handlers with a module-level
Anthropic client, `messages.parse` + structured output (Haiku 4.5) and a
streamed rewrite (Sonnet 5). Tests call the handlers directly.
- Recording took ~9s; replay ~0.6s, offline, with no API keys or `.env`.
- The stream recorded as 122 readable events.
- Harmless system-prompt rewording: Jev p=0.96, kept. "At most four gaps"
  → "at most one": p=0.04 (`format_changed` 0.69), re-recorded.
- Found and fixed: compressed bodies, account-identifying headers saved,
  and a noisy reason on brand-new recordings (now only replacements get a
  reason).
- Recording real calls needs a longer Vitest `testTimeout` than the 5s
  default (see [[configuration]]).

## Open questions
- [ ] **Package name.** `@damiensmith1/llm-cassette` already exists on npm, and
      github.com/jamal-0x1/llm-cassette (1 star) exists. Pick a different
      published name?
- [ ] Default threshold. 0.85 is a placeholder; tune it on labeled pairs,
      per judge (span-01's margins on real prompts are narrower than Jev's).
- [ ] Test `span-01-pro` (needs Respan credits).
      First live samples were far from it (0.99 vs 0.02–0.10).
- [ ] Pruning unused recordings in general (only superseded ones are
      removed today).
- [x] Candidate selection: same sequence position, else first unused for
      the endpoint (see rung 3). Revisit if Jev scores make "best score"
      worth it.
- [ ] Multi-turn cascade: re-recording turn N changes every later request.
      Re-record the rest of the sequence automatically?
- [ ] Tie re-record to `vitest -u`? That needs Vitest's internal snapshot
      state, which is unverified.
- [ ] Global interception vs AsyncLocalStorage for `test.concurrent`.
- [ ] Whether to call Jev in `record` mode only, or also offer a "judge
      and fail" CI mode that has a key.
- [ ] How to build the labeled eval set for the wrong-replay rate.
- [ ] Record inter-chunk timing for streams (optional replay delay)?
- [ ] OpenAI Responses API streams: reassemble for judging.
- [ ] Is bit-exact Jev determinism guaranteed? The docs only say
      "extremely consistent". Stored verdicts make it moot for CI.
