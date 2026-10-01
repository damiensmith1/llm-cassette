import OpenAI from "openai";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";
import { test } from "../src/adapters/vitest.js";
import { cassettePath } from "../src/cassette/path.js";
import { saveCassette } from "../src/cassette/store.js";
import { recordRequest } from "../src/normalize/request.js";
import { chatReply } from "./fixtures.js";

const file = fileURLToPath(import.meta.url);
const body = { model: "gpt-test", messages: [{ role: "user" as const, content: "classify this" }] };
const ask = () => new OpenAI({ apiKey: "sk-test-key", maxRetries: 0 }).chat.completions.create(body);

describe("vitest adapter", () => {
  beforeAll(async () => {
    vi.stubEnv("LLM_CASSETTE_MODE", "replay");
    // Pre-write the cassette this test's fixture will look for.
    const request = await recordRequest(
      new Request("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify(body) }),
    );
    await saveCassette(cassettePath(file, ["vitest adapter", "replays through global fetch"]), {
      version: 1,
      interactions: [
        {
          request,
          response: { status: 200, headers: { "content-type": "application/json" }, body: chatReply, events: null },
          recordedAt: "2026-09-30T00:00:00Z",
        },
      ],
      verdicts: [],
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(join(dirname(file), "__cassettes__"), { recursive: true, force: true });
  });

  test("replays through global fetch", async ({ cassette }) => {
    const res = await ask();
    expect(res.choices[0]?.message.content).toBe("receipts");
    expect(cassette.events.map((e) => e.kind)).toEqual(["exact"]);
  });

  test.fails("fails the test on a miss even if the error is caught", async () => {
    await ask().catch(() => undefined);
  });
});
