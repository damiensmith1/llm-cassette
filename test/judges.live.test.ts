import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createJevJudge } from "../src/match/jev.js";
import type { Judge } from "../src/match/jev.js";
import { createSpanJudge } from "../src/match/span.js";
import type { RecordedRequest } from "../src/types.js";

// Calls the real judges, each only when its key is set (or in .env).
if (existsSync(".env")) process.loadEnvFile(".env");

const req = (content: string, system = "Answer in one word."): RecordedRequest => ({
  provider: "openai",
  method: "POST",
  url: "https://api.openai.com/v1/chat/completions",
  body: { model: "gpt-test", messages: [{ role: "system", content: system }, { role: "user", content }] },
});
const reply = (content: string) => ({
  status: 200,
  headers: {},
  events: null,
  body: { choices: [{ message: { role: "assistant", content } }] },
});

const responsesReq = (input: string): RecordedRequest => ({
  provider: "openai-responses",
  method: "POST",
  url: "https://openrouter.ai/api/v1/responses",
  body: { model: "openai/gpt-test", instructions: "Answer in one word.", input },
});
const responsesReply = {
  status: 200,
  headers: {},
  events: null,
  body: { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Paris" }] }] },
};

const old = req("What is the capital of France?");
const CASES: { name: string; next: RecordedRequest; valid: boolean; old?: RecordedRequest; response?: typeof responsesReply }[] = [
  { name: "paraphrase", next: req("What's France's capital city?"), valid: true },
  { name: "system prompt reworded", next: req("What is the capital of France?", "Reply with a single word."), valid: true },
  { name: "France → Germany", next: req("What is the capital of Germany?"), valid: false },
  { name: "asks for JSON", next: req("What is the capital of France? Reply in JSON."), valid: false },
  { name: "asks for a sentence", next: req("What is the capital of France?", "Answer in a full sentence."), valid: false },
  ...[
    { name: "responses: paraphrase", input: "What's France's capital city?", valid: true },
    { name: "responses: Germany", input: "What is the capital of Germany?", valid: false },
  ].map((c) => ({ ...c, next: responsesReq(c.input), old: responsesReq("What is the capital of France?"), response: responsesReply })),
];

const judges: [string, Judge, string][] = [
  ["jev-1.13.0", createJevJudge(), "TYPESAFE_API_KEY"],
  // span-01-pro needs Respan credits; set SPAN_MODEL=span-01-pro to test it.
  [process.env.SPAN_MODEL ?? "span-01-free", createSpanJudge({ model: process.env.SPAN_MODEL ?? "span-01-free" }), "RESPAN_API_KEY"],
];
const table: string[] = [];
afterAll(() => {
  if (table.length) console.log(["", "case                     judge         p     expected", ...table].join("\n"));
});

for (const [name, judge, key] of judges) {
  (process.env[key] ? describe : describe.skip)(`${name} (live)`, () => {
    for (const c of CASES) {
      it(c.name, async () => {
        const j = await judge.judge({ old: c.old ?? old, next: c.next, response: c.response ?? reply("Paris") });
        table.push(`${c.name.padEnd(24)} ${name.padEnd(13)} ${j.p.toFixed(2)}  ${c.valid ? "replay" : "re-record"}`);
        if (c.valid) expect(j.p).toBeGreaterThan(0.5);
        else expect(j.p).toBeLessThan(0.5);
      });
    }
  });
}
