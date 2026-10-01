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
- Ignore volatile request headers: `X-Stainless-*` (retry count, timeout,
  OS/arch/runtime), idempotency keys and user-agent. Headers aren't part
  of the match key by default.
- Scrubbers: configurable rules that remove timestamps, UUIDs and IDs from
  message content before hashing.
- Redact `authorization` and `x-api-key` before writing. Response
  volatiles (ids, `created`, rate-limit headers, request ids, set-cookie)
  are stored but not compared.
- Canonical JSON (sorted keys) is used for hashing.

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
- **Streaming, interim:** SSE bodies are stored as raw text and replay
  byte for byte. The parsed event list (below) is still the plan.
- Provider is detected from the URL (`/messages` → anthropic, else openai),
  overridable for proxies.

## Matching ladder
1. **Exact.** Hash the canonical request. On a hit, replay. Free.
2. **Scrubbed.** Apply the scrubbers, hash, and replay on a hit.
3. **Hard checks, in code.** Any failure means re-record (or fail in
   `replay` mode). Jev isn't consulted for:
   - a changed model name or sampling params (temperature, max_tokens, …).
     Jev is weak at numbers.
   - a recorded tool call whose tool is missing from the new `tools`, or
     whose args don't validate against the new JSON schema;
   - a recorded structured output that fails the new `response_format`
     schema;
   - a changed non-text part (image, audio). Jev reads text only.
4. **Jev judgment.** Pick the candidate recording: the same test, the same
   position in the call sequence. Send Jev a trimmed state:
   ```
   old_request, new_request, diff (computed in code), recorded_response (flattened)
   ```
   Questions, all asked in one call:
   - `still_valid` (primary Noul): "Would `recorded_response` be a correct
     and appropriate reply to `new_request`, given the changes in `diff`?"
     Its true/false criteria are spelled out explicitly.
   - `format_changed`, `asks_different_task`: diagnostic Nouls that
     explain rejections.

   Replay if `still_valid ≥ threshold`. Otherwise re-record or fail.
5. **Miss.** Re-record in `record` mode, fail in `replay` mode.

### Stored verdicts
- Key: sha256 of (canonical old request, canonical new request, question
  text + criteria, question version, pinned model id).
- Store p, the diagnostic signals, the threshold, the model id and input
  tokens.
- In `replay` mode the verdict is read, never computed. A missing verdict
  fails the test with "re-run in record mode".

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
      "response": { "status": 200, "headers": { }, "body": { }, "events": null /* SSE later */ },
      "recordedAt": "2026-09-28T00:00:00Z"
    }
  ],
  "verdicts": [
    { "key": "sha256…", "model": "jev-1.13.0", "questionVersion": "v1",
      "p": 0.94, "signals": { "format_changed": 0.03 }, "threshold": 0.85, "replay": true }
  ]
}
```

## Streaming (post-MVP)
- Both SDKs parse SSE through `LineDecoder` (splitting on double
  newlines). Store the parsed event list (`event`, `data`), including
  Anthropic `ping`s and mid-stream `error` events. Re-serialize with
  `content-type: text/event-stream` as a `ReadableStream`.
- Optionally record gaps between chunks to test UI and abort behaviour.
  See [[Streaming Architecture in Node.js]].
- Reassemble the stream into a final message before judging.

## Vitest integration
- `llm-cassette/vitest` exports `test` / `it` (and `createTest(options)`
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

## Build order

1. [x] Cassette store + canonical hashing
2. [x] Exact replay through `openCassette().fetch`
3. [x] Global interception (`@mswjs/interceptors`) + Vitest fixture
4. [ ] Scrubbing rules
5. [ ] Hard checks
6. [ ] Jev judge + stored verdicts
7. [ ] Run report
8. [ ] Streaming as parsed SSE events

## Open questions
- [ ] **Package name.** `llm-cassette` already exists on npm, and
      github.com/jamal-0x1/llm-cassette (1 star) exists. Pick a different
      published name?
- [ ] Default threshold. 0.85 is a placeholder; tune it on labeled pairs.
- [ ] Candidate selection when a test's call count changes: match by
      sequence index, by best score, or both?
- [ ] Multi-turn cascade: re-recording turn N changes every later request.
      Re-record the rest of the sequence automatically?
- [ ] Tie re-record to `vitest -u`? That needs Vitest's internal snapshot
      state, which is unverified.
- [ ] Global interception vs AsyncLocalStorage for `test.concurrent`.
- [ ] Whether to call Jev in `record` mode only, or also offer a "judge
      and fail" CI mode that has a key.
- [ ] How to build the labeled eval set for the wrong-replay rate.
- [ ] Is bit-exact Jev determinism guaranteed? The docs only say
      "extremely consistent". Stored verdicts make it moot for CI.
