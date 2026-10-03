import { describe, expect, it, vi } from "vitest";
import { createSpanJudge, toSpanInput } from "../src/match/span.js";
import type { RecordedRequest } from "../src/types.js";

const anthropicReq = (text: string): RecordedRequest => ({
  provider: "anthropic",
  method: "POST",
  url: "https://api.anthropic.com/v1/messages",
  body: {
    model: "claude-test",
    max_tokens: 10,
    system: [{ type: "text", text: "Be brief." }],
    tools: [{ name: "weather", description: "Look up weather", input_schema: {} }],
    messages: [
      { role: "user", content: text },
      { role: "assistant", content: [{ type: "tool_use", name: "weather", input: { city: "Paris" } }] },
      { role: "user", content: [{ type: "tool_result", content: "sunny" }] },
    ],
  },
});

describe("toSpanInput", () => {
  it("flattens system, tools, blocks and tool calls to text messages", () => {
    expect(toSpanInput("anthropic", anthropicReq("weather in Paris?").body)).toEqual([
      { role: "system", content: "Be brief." },
      { role: "system", content: "Available tools:\n- weather: Look up weather" },
      { role: "user", content: "weather in Paris?" },
      { role: "assistant", content: '[tool call weather({"city":"Paris"})]' },
      { role: "user", content: "[tool result: sunny]" },
    ]);
  });

  it("appends OpenAI tool calls to the assistant message", () => {
    const body = { messages: [{ role: "assistant", content: null, tool_calls: [{ function: { name: "w", arguments: "{}" } }] }] };
    expect(toSpanInput("openai", body)).toEqual([{ role: "assistant", content: "[tool call w({})]" }]);
  });
});

describe("createSpanJudge", () => {
  const response = { status: 200, headers: {}, events: null, body: { content: [{ type: "text", text: "Sunny." }] } };

  it("scores the recorded reply against the new request", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("span-01-pro");
      expect(body.span.output).toEqual({ role: "assistant", content: "Sunny." });
      expect(body.span.input.at(-2).content).toBe("[tool result: sunny]");
      expect(body.span.input.at(-1)).toEqual({
        role: "system",
        content: "This instruction changed after the reply below was written.\nIn messages[0].content:\nBefore: a\nNow: b",
      });
      expect(body.behaviors.map((b: { id: string }) => b.id)).toEqual(["breaks_change", "format_mismatch", "off_task"]);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      return Response.json({
        model: "span-01-pro",
        results: [
          { id: "breaks_change", p_present: 0.06, p_absent: 0.91, p_not_observable: 0.03 },
          { id: "format_mismatch", p_present: 0.03, p_absent: 0.96, p_not_observable: 0.01 },
          { id: "off_task", p_present: 0.02, p_absent: 0.97, p_not_observable: 0.01 },
        ],
        usage: { input_tokens: 88 },
      });
    });
    const judge = createSpanJudge({ apiKey: "test-key", fetch });
    expect(judge.id).toBe("span-01-pro:v1");
    expect(await judge.judge({ old: anthropicReq("a"), next: anthropicReq("b"), response })).toEqual({
      p: 0.91,
      signals: { format_mismatch: 0.03, off_task: 0.02 },
      model: "span-01-pro",
      inputTokens: 88,
    });
  });

  it("throws on API errors so the session fails closed", async () => {
    const fetch = vi.fn(async () => new Response('{"detail":"daily cap"}', { status: 429 }));
    const judge = createSpanJudge({ apiKey: "k", model: "span-01-free", fetch });
    await expect(judge.judge({ old: anthropicReq("a"), next: anthropicReq("b"), response })).rejects.toThrow(/429/);
  });

  it("needs a key", async () => {
    vi.stubEnv("RESPAN_API_KEY", "");
    await expect(createSpanJudge().judge({ old: anthropicReq("a"), next: anthropicReq("b"), response })).rejects.toThrow(/RESPAN_API_KEY/);
    vi.unstubAllEnvs();
  });
});

describe("judge options", () => {
  it("carries a per-judge threshold and reports a missing key", async () => {
    const { createJevJudge } = await import("../src/match/jev.js");
    vi.stubEnv("TYPESAFE_API_KEY", "");
    vi.stubEnv("RESPAN_API_KEY", "");
    expect(createSpanJudge({ threshold: 0.8 }).threshold).toBe(0.8);
    expect(createJevJudge().threshold).toBeUndefined();
    expect(createJevJudge().setupProblem?.()).toBe("TYPESAFE_API_KEY is not set");
    expect(createSpanJudge().setupProblem?.()).toBe("RESPAN_API_KEY is not set");
    expect(createSpanJudge({ apiKey: "k" }).setupProblem?.()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
