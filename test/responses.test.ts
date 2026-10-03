import OpenAI from "openai";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDiff } from "../src/match/diff.js";
import { hardChecks } from "../src/match/hardChecks.js";
import { flattenResponse } from "../src/match/jev.js";
import { toSpanInput } from "../src/match/span.js";
import { detectProvider } from "../src/normalize/request.js";
import { finalBody, parseSse } from "../src/normalize/stream.js";
import { openCassette } from "../src/session.js";
import type { Interaction, RecordedRequest } from "../src/types.js";

const OPENROUTER = "https://openrouter.ai/api/v1";

const response = (text: string, extra: unknown[] = []) => ({
  id: "resp_1",
  object: "response",
  created_at: 1,
  status: "completed",
  model: "openai/gpt-test",
  output: [
    ...extra,
    { id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
});

const weather = { type: "function", name: "weather", parameters: { type: "object", properties: { city: { type: "string" } } } };
const callWeather = { id: "fc_1", type: "function_call", call_id: "call_1", name: "weather", arguments: '{"city":"Paris"}', status: "completed" };

const req = (body: Record<string, unknown>): RecordedRequest => ({
  provider: "openai-responses",
  method: "POST",
  url: `${OPENROUTER}/responses`,
  body: { model: "openai/gpt-test", instructions: "Answer in one word.", input: "What is the capital of France?", ...body },
});
const interaction = (request: RecordedRequest, body: unknown): Interaction => ({
  request, recordedAt: "", response: { status: 200, headers: {}, body, events: null },
});

describe("Responses API shape", () => {
  it("is detected by path, on OpenAI and compatible hosts", () => {
    expect(detectProvider("https://api.openai.com/v1/responses")).toBe("openai-responses");
    expect(detectProvider(`${OPENROUTER}/responses`)).toBe("openai-responses");
    expect(detectProvider(`${OPENROUTER}/chat/completions`)).toBe("openai");
  });

  it("treats input and instructions as prompt text, not settings", () => {
    const old = interaction(req({}), response("Paris"));
    expect(hardChecks(old, req({ input: "What's France's capital?", instructions: "Reply with one word." }))).toEqual({ ok: true });
    expect(requestDiff(old.request, req({ input: "What's France's capital?" }))).toEqual([
      { path: "input", before: "What is the capital of France?", after: "What's France's capital?" },
    ]);
  });

  it("still rejects settings, output format and called-tool schema changes", () => {
    const old = interaction(req({ tools: [weather] }), response("", [callWeather]));
    expect(hardChecks(old, req({ tools: [weather], max_output_tokens: 5 }))).toMatchObject({ reason: "settings changed: max_output_tokens" });
    expect(hardChecks(old, req({ tools: [weather], text: { format: { type: "json_object" } } }))).toMatchObject({ reason: "settings changed: text" });
    expect(hardChecks(old, req({ tools: [] }))).toMatchObject({ reason: 'recorded reply calls tool "weather", which was removed' });
    expect(hardChecks(old, req({ tools: [weather, { type: "web_search" }] }))).toEqual({ ok: true });
  });

  it("rejects changed images in input items", () => {
    const img = (url: string) => ({ input: [{ role: "user", content: [{ type: "input_text", text: "what is this" }, { type: "input_image", image_url: url }] }] });
    expect(hardChecks(interaction(req(img("a.png")), response("cat")), req(img("b.png")))).toMatchObject({ ok: false, reason: "image, audio or file input changed" });
  });

  it("flattens replies and inputs for the judges", () => {
    expect(flattenResponse("openai-responses", response("Sunny.", [callWeather]))).toEqual({
      text: "Sunny.",
      tool_calls: [{ name: "weather", args: '{"city":"Paris"}' }],
    });
    const body = {
      instructions: "Be brief.",
      tools: [weather, { type: "web_search" }],
      input: [
        { role: "user", content: [{ type: "input_text", text: "weather in Paris?" }] },
        callWeather,
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
      ],
    };
    expect(toSpanInput("openai-responses", body)).toEqual([
      { role: "system", content: "Be brief." },
      { role: "system", content: "Available tools:\n- weather" },
      { role: "user", content: "weather in Paris?" },
      { role: "assistant", content: '[tool call weather({"city":"Paris"})]' },
      { role: "tool", content: "[tool result: sunny]" },
    ]);
  });

  it("reassembles a stream from its response.completed event", () => {
    const events = parseSse(
      [
        ["response.created", { type: "response.created", response: { ...response(""), status: "in_progress", output: [] } }],
        ["response.output_text.delta", { type: "response.output_text.delta", delta: "Paris" }],
        ["response.completed", { type: "response.completed", response: response("Paris") }],
      ].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""),
    );
    expect(flattenResponse("openai-responses", finalBody("openai-responses", { status: 200, headers: {}, body: null, events })).text).toBe("Paris");
  });
});

describe("Responses API through the OpenAI SDK, on OpenRouter", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    path = join(dir, "c.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const net = () =>
    vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => Response.json(response("Paris")));

  async function ask(options: Parameters<typeof openCassette>[1], input: string, stream = false) {
    const session = await openCassette(path, options);
    const client = new OpenAI({ apiKey: "sk-or-test", baseURL: OPENROUTER, fetch: session.fetch, maxRetries: 0 });
    let text: string;
    if (stream) {
      text = "";
      const s = await client.responses.create({ model: "openai/gpt-test", instructions: "Answer in one word.", input, stream: true });
      for await (const e of s) if (e.type === "response.output_text.delta") text += e.delta;
    } else {
      text = (await client.responses.create({ model: "openai/gpt-test", instructions: "Answer in one word.", input })).output_text;
    }
    await session.save();
    return { session, text };
  }

  it("records and replays, and judges a prompt edit", async () => {
    const first = await ask({ mode: "record", fetch: net(), judge: false }, "What is the capital of France?");
    expect(first.text).toBe("Paris");
    expect(JSON.parse(await readFile(path, "utf8")).interactions[0].request.provider).toBe("openai-responses");

    const judge = { id: "fake:v1", judge: vi.fn(async (_input: unknown) => ({ p: 0.97, signals: {}, model: "fake", inputTokens: 1 })) };
    const edited = await ask({ mode: "record", fetch: net(), judge }, "What's France's capital city?");
    expect(edited.text).toBe("Paris");
    expect(edited.session.events).toMatchObject([{ kind: "judged", p: 0.97 }]);
    expect(judge.judge.mock.calls[0]?.[0]).toMatchObject({ next: { body: { input: "What's France's capital city?" } } });

    const replay = await ask({ mode: "replay", judge }, "What's France's capital city?");
    expect(replay.session.events).toMatchObject([{ kind: "judged" }]);
  });

  it("records and replays a Responses stream", async () => {
    const sse = [
      { type: "response.created", sequence_number: 0, response: { ...response(""), status: "in_progress", output: [] } },
      { type: "response.output_text.delta", sequence_number: 1, item_id: "msg_1", output_index: 0, content_index: 0, delta: "Pa", logprobs: [] },
      { type: "response.output_text.delta", sequence_number: 2, item_id: "msg_1", output_index: 0, content_index: 0, delta: "ris", logprobs: [] },
      { type: "response.completed", sequence_number: 3, response: response("Paris") },
    ].map((d) => `event: ${d.type}\ndata: ${JSON.stringify(d)}\n\n`).join("");
    const streamNet = vi.fn(async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }));
    expect((await ask({ mode: "record", fetch: streamNet, judge: false }, "capital of France?", true)).text).toBe("Paris");
    expect((await ask({ mode: "replay" }, "capital of France?", true)).text).toBe("Paris");
  });
});
