import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalBody, parseSse, serializeSse } from "../src/normalize/stream.js";
import { openCassette } from "../src/session.js";

const openaiChunks = [
  { id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-test", choices: [{ index: 0, delta: { role: "assistant", content: "Pa" }, finish_reason: null }] },
  { id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-test", choices: [{ index: 0, delta: { content: "ris" }, finish_reason: "stop" }] },
];
const openaiSse = openaiChunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";

const anthropicEvents = [
  ["message_start", { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "claude-test", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["ping", { type: "ping" }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Pa" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ris" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }],
  ["message_stop", { type: "message_stop" }],
] as const;
const anthropicSse = anthropicEvents.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

const sseNetwork = (body: string) =>
  vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => new Response(body, { headers: { "content-type": "text/event-stream" } }));

describe("SSE parsing", () => {
  it("parses events, JSON data and [DONE], and drops comments", () => {
    const events = parseSse(": keepalive\n\nevent: ping\ndata: {\"type\":\"ping\"}\n\ndata: [DONE]\n\n");
    expect(events).toEqual([{ event: "ping", data: { type: "ping" } }, { data: "[DONE]" }]);
  });

  it("round-trips through serialization", () => {
    expect(parseSse(serializeSse(parseSse(anthropicSse)).join(""))).toEqual(parseSse(anthropicSse));
  });

  it("handles multi-line data", () => {
    expect(parseSse(serializeSse([{ data: "line one\nline two" }]).join(""))).toEqual([{ data: "line one\nline two" }]);
  });
});

describe("finalBody", () => {
  it("reassembles OpenAI chunks", () => {
    const body = finalBody("openai", { status: 200, headers: {}, body: null, events: parseSse(openaiSse) }) as any;
    expect(body.choices[0].message.content).toBe("Paris");
  });

  it("reassembles Anthropic events, including tool input", () => {
    const events = parseSse(anthropicSse);
    expect((finalBody("anthropic", { status: 200, headers: {}, body: null, events }) as any).content).toEqual([{ type: "text", text: "Paris" }]);
    const tool = parseSse(
      [
        { type: "message_start", message: { content: [] } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "weather", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"city":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"Paris"}' } },
        { type: "content_block_stop", index: 0 },
      ].map((d) => `data: ${JSON.stringify(d)}\n\n`).join(""),
    );
    expect((finalBody("anthropic", { status: 200, headers: {}, body: null, events: tool }) as any).content[0].input).toEqual({ city: "Paris" });
  });
});

describe("streamed record/replay", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    path = join(dir, "c.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function openaiStream(fetch: typeof globalThis.fetch, content = "capital of France?") {
    const client = new OpenAI({ apiKey: "sk-test-key", fetch, maxRetries: 0 });
    const stream = await client.chat.completions.create({ model: "gpt-test", stream: true, messages: [{ role: "user", content }] });
    let text = "";
    for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? "";
    return text;
  }

  it("records OpenAI streams as readable events and replays them chunk by chunk", async () => {
    const rec = await openCassette(path, { mode: "record", fetch: sseNetwork(openaiSse) });
    expect(await openaiStream(rec.fetch)).toBe("Paris");
    await rec.save();

    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved.interactions[0].response.body).toBeNull();
    expect(saved.interactions[0].response.events).toHaveLength(3);
    expect(saved.interactions[0].response.events[0].data.choices[0].delta.content).toBe("Pa");

    const play = await openCassette(path, { mode: "replay" });
    expect(await openaiStream(play.fetch)).toBe("Paris");
  });

  it("replays Anthropic streams through the SDK's stream helper", async () => {
    const ask = async (fetch: typeof globalThis.fetch) => {
      const client = new Anthropic({ apiKey: "sk-ant-test-key", fetch, maxRetries: 0 });
      const message = await client.messages
        .stream({ model: "claude-test", max_tokens: 10, messages: [{ role: "user", content: "capital of France?" }] })
        .finalMessage();
      return message.content[0]?.type === "text" ? message.content[0].text : undefined;
    };
    const rec = await openCassette(path, { mode: "record", fetch: sseNetwork(anthropicSse) });
    expect(await ask(rec.fetch)).toBe("Paris");
    await rec.save();

    const play = await openCassette(path, { mode: "replay" });
    expect(await ask(play.fetch)).toBe("Paris");
  });

  it("lets the judge see a streamed recording's text", async () => {
    const rec = await openCassette(path, { mode: "record", fetch: sseNetwork(openaiSse), judge: false });
    await openaiStream(rec.fetch);
    await rec.save();

    const judge = { id: "fake:v1", judge: vi.fn(async () => ({ p: 0.97, signals: {}, model: "fake", inputTokens: 1 })) };
    const next = await openCassette(path, { mode: "record", fetch: sseNetwork(openaiSse), judge });
    expect(await openaiStream(next.fetch, "What's France's capital?")).toBe("Paris");
    expect(next.events).toMatchObject([{ kind: "judged" }]);
    expect(judge.judge.mock.calls[0]).toBeDefined();
  });
});
