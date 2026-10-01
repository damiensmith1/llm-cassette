import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createJevJudge } from "../src/match/jev.js";
import type { RecordedRequest } from "../src/types.js";

// Calls the real Jev API. Runs only when TYPESAFE_API_KEY is set (or in .env).
if (!process.env.TYPESAFE_API_KEY && existsSync(".env")) process.loadEnvFile(".env");
const live = process.env.TYPESAFE_API_KEY ? describe : describe.skip;

const req = (content: string): RecordedRequest => ({
  provider: "openai",
  method: "POST",
  url: "https://api.openai.com/v1/chat/completions",
  body: { model: "gpt-test", messages: [{ role: "system", content: "Answer in one word." }, { role: "user", content }] },
});
const response = {
  status: 200,
  headers: {},
  events: null,
  body: { choices: [{ message: { role: "assistant", content: "Paris" } }] },
};

live("Jev (live)", () => {
  const judge = createJevJudge();
  const old = req("What is the capital of France?");

  it("accepts a paraphrase", async () => {
    const j = await judge.judge({ old, next: req("What's France's capital city?"), response });
    console.log("paraphrase", j);
    expect(j.p).toBeGreaterThan(0.85);
  });

  it("rejects a near-miss with a different answer", async () => {
    const j = await judge.judge({ old, next: req("What is the capital of Germany?"), response });
    console.log("near-miss", j);
    expect(j.p).toBeLessThan(0.5);
  });

  it("rejects a format change", async () => {
    const j = await judge.judge({ old, next: req("What is the capital of France? Reply in JSON."), response });
    console.log("format change", j);
    expect(j.p).toBeLessThan(0.85);
  });
});
