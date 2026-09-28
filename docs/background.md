---
title: Background
tags: [llm-cassette, jev, typesafe, testing, library]
status: draft
---

# Background

## The problem

Tests that call an LLM are slow, cost money, and give different results on
every run, even at temperature 0. Teams usually do one of these:

- **Hand-written mocks** (`jest.mock` on the SDK, Vercel AI SDK's
  `MockLanguageModel`). These are fast, but they drift from what the real
  API returns and test very little.
- **HTTP cassettes** (nock, Polly.js, vcrpy, aimock). A real response is
  recorded once and replayed after that.
- **Evals in CI** (promptfoo, evalite, LangSmith). These make live calls
  and judge whether the output is good. They don't help with skipping
  calls.
- **Live calls in CI.** Expensive and flaky.

Cassettes come closest, but they share one failure: **prompts change all
the time.** Matching works by exact hash or string. So either:

- a small prompt edit breaks the match, and you re-record every cassette
  after every edit. Teams complain about this churn, and some build
  review-gated re-record jobs by hand; or
- matching is loose (aimock looks only at the last user message), and a
  changed system prompt or tool schema silently replays a **stale answer**.

Exact hashing is usually a deliberate choice. It guarantees nothing stale
replays, and teams accept the churn as the cost. That tradeoff is the gap
this project targets.

## The idea

Put a judge in the grey zone. When a request is close to a recording but
not identical, ask TypeSafe's **Jev** whether the recorded response is
still a valid reply to the new request. Jev is a System One model that
returns calibrated probabilities (see [[jevfilter]] and
[[semantic-pubsub-jev]] for earlier Jev work). Replay when P(valid) is
above a threshold. Otherwise re-record, or fail with a reason. Store the
verdict in the cassette, so CI never calls Jev and stays deterministic.

Pitch: **cassettes that survive prompt edits without replaying stale
answers.**

## Prior art (researched 2026-09-27)

### Generic HTTP record/replay
| Tool | Stars | Notes |
|---|---|---|
| Ruby VCR | 6.1k | The original. Record modes `once/new_episodes/none/all`. |
| VCR.py | 3.0k | Python. Doesn't match on body by default. |
| Polly.js (Netflix) | 10.2k | HAR format. Effectively unmaintained since 2023. No native Node fetch support. |
| nock / nock.back | 13.1k | v14 is built on `@mswjs/interceptors`. Modes `wild/dryrun/record/update/lockdown`. |
| msw | 18.2k | Handlers written by hand. No recording. |
| undici SnapshotAgent | (undici 7.7k) | Real record/replay, but bodies are base64 blobs that can't be diffed. |

All of them match on URL + body. None understand LLM request shapes.

### LLM-specific
- **CopilotKit/aimock:** 949 stars, about **1.2M npm downloads a week**.
  The one established TypeScript player. It matches fixtures against the
  **last user message only**, using substring, exact, RegExp or a predicate
  function. It has no semantic matching. It records streams with frame
  timing and ships Vitest/Jest plugins. Its weaknesses: false hits when the
  system prompt or tools change, and misses on rewording.
- **Dozens of 0–2 star clones from 2026** in TS, Python, PHP and Java
  (llm-vcr, llm-cassette, standin, agentreplay, promptcheck, …). They're
  all hash-based. The only one with any "semantic" matching is a PHP repo
  using raw embedding cosine similarity.
- **Vercel AI SDK `ai/test`:** hand-written mocks, no record/replay.
- **LangSmith:** has a vcrpy cassette cache for **pytest only**. Nothing
  for JS.

### Semantic caching research
- **vCache** (ICLR 2026, arXiv 2502.03771): similarity scores for correct
  and incorrect cache hits heavily overlap, so no static threshold is safe.
- **Krites** (arXiv 2602.13165): uses an LLM judge to approve grey-zone
  near-miss cache hits. The closest precedent for the judge idea, but for
  production caching, not tests.
- Production semantic caches (GPTCache, Redis LangCache, LiteLLM, Portkey)
  all embed the prompt, find the nearest neighbour and apply a static
  threshold. Their own docs warn about false positives.

**Gap:** no testing tool uses a calibrated judge to decide whether a
recording is still valid.

## Why TypeScript first

- Python already has vcrpy, pytest-recording, LangSmith's cache and most
  of the clones. TypeScript has only aimock, which has no semantic
  matching.
- Many AI features ship from TS apps (Next.js, Vercel AI SDK).
- Both official SDKs (`openai`, `@anthropic-ai/sdk`) use global `fetch`,
  and Jev has a TS SDK (`@typesafe-ai/sdk`).
- It's the author's main stack. The core stays simple so a Python port is
  easy later.

## Related local work
- `~/Documents/projects/jevfilter/src/jevfilter/judges/recording.py` has a
  JSONL cassette keyed by sha256 of (state, questions), with
  `RecordingJudge` and `ReplayJudge`. Reuse the keying approach.
- [[semantic-pubsub-jev]] measured Jev at about 193ms for 1 question and a
  0% flip rate across 20 repeats. Wording alone changed 23.8% of routing
  decisions.
