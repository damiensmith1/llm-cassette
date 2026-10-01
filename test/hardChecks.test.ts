import { describe, expect, it } from "vitest";
import { pickCandidate } from "../src/match/candidate.js";
import { hardChecks } from "../src/match/hardChecks.js";
import { createScrubber } from "../src/normalize/scrub.js";
import type { Cassette, Interaction, RecordedRequest } from "../src/types.js";

const OPENAI = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

const weatherTool = { type: "function", function: { name: "weather", parameters: { type: "object", properties: { city: { type: "string" } } } } };

function openaiReq(body: Record<string, unknown>): RecordedRequest {
  return { provider: "openai", method: "POST", url: OPENAI, body: { model: "gpt-test", messages: [{ role: "user", content: "hi" }], ...body } };
}

function interaction(request: RecordedRequest, responseBody: unknown = { choices: [{ message: { content: "ok" } }] }): Interaction {
  return { request, response: { status: 200, headers: {}, body: responseBody, events: null }, recordedAt: "" };
}

const withToolCall = { choices: [{ message: { tool_calls: [{ function: { name: "weather", arguments: "{}" } }] } }] };

describe("hardChecks", () => {
  it("passes when only the conversation text changed", () => {
    const old = interaction(openaiReq({ messages: [{ role: "user", content: "capital of France?" }] }));
    expect(hardChecks(old, openaiReq({ messages: [{ role: "user", content: "France's capital?" }] }))).toEqual({ ok: true });
  });

  it("rejects a model change", () => {
    const r = hardChecks(interaction(openaiReq({})), openaiReq({ model: "gpt-other" }));
    expect(r).toEqual({ ok: false, reason: "model changed (gpt-test → gpt-other)" });
  });

  it("rejects changed settings and names them", () => {
    const r = hardChecks(interaction(openaiReq({ temperature: 0 })), openaiReq({ temperature: 1, max_tokens: 5 }));
    expect(r).toEqual({ ok: false, reason: "settings changed: max_tokens, temperature" });
  });

  it("treats a response_format change as a settings change", () => {
    const r = hardChecks(interaction(openaiReq({})), openaiReq({ response_format: { type: "json_object" } }));
    expect(r).toMatchObject({ ok: false, reason: "settings changed: response_format" });
  });

  it("ignores caller fields", () => {
    const r = hardChecks(interaction(openaiReq({ user: "a" })), openaiReq({ user: "b" }), createScrubber());
    expect(r).toEqual({ ok: true });
  });

  it("rejects a changed image", () => {
    const img = (url: string) => ({ messages: [{ role: "user", content: [{ type: "text", text: "what is this" }, { type: "image_url", image_url: { url } }] }] });
    const r = hardChecks(interaction(openaiReq(img("a.png"))), openaiReq(img("b.png")));
    expect(r).toEqual({ ok: false, reason: "image, audio or file input changed" });
  });

  it("rejects when a called tool was removed or its schema changed", () => {
    const old = interaction(openaiReq({ tools: [weatherTool] }), withToolCall);
    expect(hardChecks(old, openaiReq({ tools: [] }))).toMatchObject({ reason: 'recorded reply calls tool "weather", which was removed' });
    const changed = { ...weatherTool, function: { ...weatherTool.function, parameters: { type: "object", properties: { zip: { type: "string" } } } } };
    expect(hardChecks(old, openaiReq({ tools: [changed] }))).toMatchObject({ reason: 'schema of called tool "weather" changed' });
  });

  it("allows tool description edits and changes to tools that weren't called", () => {
    const old = interaction(openaiReq({ tools: [weatherTool] }), withToolCall);
    const described = { ...weatherTool, function: { ...weatherTool.function, description: "Look up weather" } };
    const extra = { type: "function", function: { name: "news", parameters: {} } };
    expect(hardChecks(old, openaiReq({ tools: [described, extra] }))).toEqual({ ok: true });
  });

  it("reads Anthropic tool_use blocks and lets system prompt edits through", () => {
    const req = (system: string, schema: unknown): RecordedRequest => ({
      provider: "anthropic", method: "POST", url: ANTHROPIC,
      body: { model: "claude-test", max_tokens: 100, system, messages: [], tools: [{ name: "weather", input_schema: schema }] },
    });
    const old = interaction(req("Be brief.", { type: "object" }), { content: [{ type: "tool_use", name: "weather", input: {} }] });
    expect(hardChecks(old, req("Be concise.", { type: "object" }))).toEqual({ ok: true });
    expect(hardChecks(old, req("Be concise.", { type: "object", required: ["city"] }))).toMatchObject({ ok: false });
  });

  it("rejects streamed recordings for now", () => {
    const r = hardChecks(interaction(openaiReq({}), "data: {...}\n\n"), openaiReq({ messages: [] }));
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("streamed") });
  });
});

describe("pickCandidate", () => {
  const cassette: Cassette = { version: 1, verdicts: [], interactions: [interaction(openaiReq({})), interaction(openaiReq({}))] };

  it("prefers the same position in the call sequence", () => {
    expect(pickCandidate(cassette, new Set(), 1, openaiReq({}))).toBe(1);
  });

  it("falls back to the first unused recording for the endpoint", () => {
    expect(pickCandidate(cassette, new Set([1]), 1, openaiReq({}))).toBe(0);
    expect(pickCandidate(cassette, new Set([0, 1]), 0, openaiReq({}))).toBe(-1);
  });
});
