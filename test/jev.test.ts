import { describe, expect, it, vi } from "vitest";
import { requestDiff } from "../src/match/diff.js";
import { buildState, createJevJudge, flattenResponse, verdictKey } from "../src/match/jev.js";
import type { RecordedRequest } from "../src/types.js";

const req = (content: string, system = "Be brief."): RecordedRequest => ({
  provider: "anthropic",
  method: "POST",
  url: "https://api.anthropic.com/v1/messages",
  body: { model: "claude-test", max_tokens: 50, system, messages: [{ role: "user", content }] },
});
const response = { status: 200, headers: {}, events: null, body: { content: [{ type: "text", text: "Paris." }] } };

describe("requestDiff", () => {
  it("lists changed text leaves only", () => {
    expect(requestDiff(req("capital of France?"), req("France's capital?", "Be concise."))).toEqual([
      { path: "messages[0].content", before: "capital of France?", after: "France's capital?" },
      { path: "system", before: "Be brief.", after: "Be concise." },
    ]);
  });
});

describe("diff of long strings", () => {
  it("keeps only the edit and some context", () => {
    const pad = "word ".repeat(1000);
    const [change] = requestDiff(req(`${pad}France${pad}`), req(`${pad}Germany${pad}`));
    expect(change!.before).toMatch(/^….*France.*…$/);
    expect(change!.after).toMatch(/^….*Germany.*…$/);
    expect(String(change!.after).length).toBeLessThan(700);
  });
});

describe("buildState", () => {
  it("includes both requests, the diff and the flattened reply", () => {
    const state = buildState({ old: req("a"), next: req("b"), response })!;
    expect(Object.keys(state).sort()).toEqual(["diff", "new_request", "old_request", "recorded_response"]);
    expect(state.recorded_response).toEqual({ text: "Paris.", tool_calls: [] });
    expect(state.new_request).not.toHaveProperty("model");
  });

  it("falls back to the diff alone when the requests are too large", () => {
    const big = "x".repeat(60_000);
    const state = buildState({ old: req(`a ${big}`), next: req(`b ${big}`), response })!;
    expect(Object.keys(state).sort()).toEqual(["diff", "recorded_response"]);
  });
});

describe("flattenResponse", () => {
  it("reads OpenAI text and tool calls", () => {
    const body = { choices: [{ message: { content: "hi", tool_calls: [{ function: { name: "w", arguments: "{}" } }] } }] };
    expect(flattenResponse("openai", body)).toEqual({ text: "hi", tool_calls: [{ name: "w", args: "{}" }] });
  });
});

describe("verdictKey", () => {
  it("changes with the judge id", () => {
    expect(verdictKey(req("a"), req("b"), "jev-1.13.0:v1")).not.toBe(verdictKey(req("a"), req("b"), "jev-1.13.0:v2"));
  });
});

describe("createJevJudge", () => {
  it("sends a pinned model and parses the answers", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("jev-1.13.0");
      expect(Object.keys(body.questions).sort()).toEqual(["asks_different_task", "format_changed", "still_valid"]);
      expect(body.state.diff).toHaveLength(1);
      return Response.json({
        model: "jev-1.13.0",
        answers: {
          still_valid: { type: "noul", noul: 0.93 },
          format_changed: { type: "noul", noul: 0.02 },
          asks_different_task: { type: "noul", noul: 0.04 },
        },
        usage: { input_tokens: 321, output_tokens: 0 },
      });
    });
    const judge = createJevJudge({ apiKey: "test-key", fetch });
    expect(judge.id).toBe("jev-1.13.0:v1");
    expect(await judge.judge({ old: req("capital of France?"), next: req("France's capital?"), response })).toEqual({
      p: 0.93,
      signals: { format_changed: 0.02, asks_different_task: 0.04 },
      model: "jev-1.13.0",
      inputTokens: 321,
    });
  });
});
