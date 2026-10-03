# llm-cassette

```bash
npm install -D @damiensmith1/llm-cassette
```

Record and replay OpenAI and Anthropic API calls in your tests.

The first run calls the real API and saves the responses to a cassette file.
Later runs, including CI, replay them: no network, no API keys, no cost.

When you edit a prompt, most cassette tools break. llm-cassette asks a judge
model whether the saved response still answers the new prompt. If it does,
the cassette is kept; if not, that call is re-recorded. The verdict is saved
in the cassette, so CI stays deterministic.

Early development. Works with Vitest and Jest, the official `openai` and
`@anthropic-ai/sdk` clients (OpenAI Chat Completions and Responses,
Anthropic Messages, streaming included), OpenAI-compatible hosts such as
OpenRouter, and Node 22+.

> **Beta:** OpenAI (Chat Completions and Responses) and OpenRouter support
> is tested with the official `openai` client against simulated responses,
> but not yet against the live APIs. Anthropic has been tested on a real app.
> Please [open an issue](https://github.com/damiensmith1/llm-cassette/issues)
> if something doesn't record or replay correctly.

## Quick start

```ts
// classify.test.ts
import { expect } from "vitest";
import { test } from "@damiensmith1/llm-cassette/vitest";
import { classify } from "./classify";

test("classifies receipts", async () => {
  expect(await classify("Your order has shipped")).toBe("receipts");
});
```

No changes to your app code: calls to `api.openai.com`,
`api.anthropic.com` and `openrouter.ai` are captured automatically (add
other OpenAI-compatible hosts with the `hosts` option). Each test gets its own
cassette in `__cassettes__/` next to the test file. Commit them.

```bash
LLM_CASSETTE_MODE=record npx vitest   # record new calls (default locally)
LLM_CASSETTE_MODE=replay npx vitest   # never touch the network (default on CI)
```

Recording makes real calls, so raise the test timeout (e.g. `60_000`).

### Jest

```js
// jest.config.js
module.exports = {
  setupFilesAfterEnv: ["@damiensmith1/llm-cassette/jest"],
  reporters: ["default", "@damiensmith1/llm-cassette/jest/reporter"],
};
```

Every test then gets a cassette automatically. To set options for a test
file, call `configureCassette({ ... })` at the top of it; `useCassette()`
returns the current test's session.

## How matching works

Each request is matched against the cassette, cheapest check first:

1. **Exact:** the same request.
2. **Scrubbed:** the same apart from timestamps, UUIDs and caller fields.
3. **Hard checks:** a changed model, setting, output format, tool schema or
   image always re-records.
4. **Judge:** only the prompt text changed, so a judge decides whether the
   saved response still fits.

## Judges

| Judge | Setup | Notes |
|---|---|---|
| [Jev](https://docs.typesafe.ai) (default) | `TYPESAFE_API_KEY` | |
| [span-01](https://respan.ai/docs/documentation/span-01/concept) | `RESPAN_API_KEY` | Experimental |
| None | `judge: false` | Any prompt edit re-records |
| Your own | `{ id, judge(input) }` | |

Judges only run while recording. Replay reads saved verdicts.

```ts
import { createSpanJudge } from "@damiensmith1/llm-cassette";
import { createTest } from "@damiensmith1/llm-cassette/vitest";

export const test = createTest({
  judge: createSpanJudge({ model: "span-01-free" }),
  threshold: 0.9, // minimum probability to keep a recording (default 0.85)
});
```

### API keys

Set the judge's key in your shell or CI secrets (`TYPESAFE_API_KEY` for
Jev, `RESPAN_API_KEY` for span-01), or pass it as `apiKey`. Keys are only
needed when recording; replay and CI need none.

Neither Vitest nor Jest loads `.env` into tests. To use one, load it in a
setup file with Node's built-in loader:

```ts
// test/setup.ts (add to setupFiles in Vitest, setupFilesAfterEnv in Jest)
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
```

## Report

```ts
// vitest.config.ts
export default defineConfig({
  test: { reporters: ["default", "@damiensmith1/llm-cassette/vitest/reporter"] },
});
```

```
llm-cassette: 38 exact, 4 judged, 1 recorded
  summarizes (test/summary.test.ts)
    judged p=0.96: POST /v1/messages
    recorded: POST /v1/messages — judge says the recording no longer fits (p=0.04 < 0.85)
```

## Configuration

Every option and environment variable is listed in
[docs/configuration.md](docs/configuration.md). The design is in
[docs/design.md](docs/design.md).

## License

MIT
