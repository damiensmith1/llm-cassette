---
title: Configuration
tags: [llm-cassette, configuration]
status: draft
---

# Configuration

Every knob in one place. Implementation details are in [[design]].

**Precedence:** explicit option → environment variable → default.

## Session / test options

Passed to `openCassette(path, options)` or `createTest(options)` from
`llm-cassette/vitest`.

| Option | Env var | Default | What it does |
|---|---|---|---|
| `mode` | `LLM_CASSETTE_MODE` | `replay` if `CI` is set, else `record` | `replay`: no network, fail on a miss. `record`: replay matches, record misses. `refresh`: re-record everything. |
| `threshold` | `LLM_CASSETTE_THRESHOLD` | `0.85` | Minimum judge probability to replay after a prompt edit. Applied to stored verdicts too, so changing it takes effect without re-judging. Must be 0–1. |
| `judge` | — | Jev (`jev-1.13.0`) | `false`: text edits always re-record. Or a custom `Judge` (`{ id, judge(input) }`), or `createJevJudge({ model, apiKey })`. |
| `scrub` | — | ISO dates/datetimes, UUIDs; ignore `user`, `metadata` | `{ patterns, ignoreFields }` are added to the defaults. `false`: exact matches only. |
| `provider` | — | from URL (`/messages` → anthropic) | Force `openai` or `anthropic` for proxies and custom base URLs. |
| `fetch` | — | global `fetch` | (`openCassette` only) the real fetch used when recording. |

Jev reads its key from `TYPESAFE_API_KEY` (only needed in record/refresh
mode). The library doesn't load `.env` files; load them yourself.

## Vitest-only options (`createTest`)

| Option | Default | What it does |
|---|---|---|
| `hosts` | `api.openai.com`, `api.anthropic.com` | Hosts routed through the cassette; other HTTP passes through. |
| `onMiss` | `fail` | `warn`: a replay miss or rejection is reported but doesn't fail the test. |
| `cassettePath` | `__cassettes__/<file>/<slug>.<hash8>.json` next to the test | `(testFile, names) => path`. |

```ts
// test/llm.ts
import { createTest } from "llm-cassette/vitest";
export const test = createTest({ threshold: 0.9, onMiss: "warn", hosts: ["llm-proxy.internal"] });
```

## Report (`llm-cassette/vitest/reporter`)

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: ["default", ["llm-cassette/vitest/reporter", { detail: "all", outputFile: "llm-cassette.json" }]],
  },
});
```

| Option | Env var | Default | What it does |
|---|---|---|---|
| `detail` | `LLM_CASSETTE_REPORT` | `changes` | `none`: totals line only. `changes`: also list judged, rejected, recorded and missed requests with p and reasons. `all`: every request. |
| `outputFile` | — | none | Also write the full summary as JSON (for CI artifacts or PR comments). |
| `onReport` | — | print to console | `(summary) => void`: custom output instead of printing. |

Event kinds in the report: `exact`, `scrubbed`, `judged` (replayed, with p),
`rejected` (judge said no, replay mode), `recorded`, `miss`.

## Core report API

For other runners: `summarize(testReports)`, `formatSummary(summary,
detail)` and `toReportEvents(session.events)` are exported from the main
entry.
