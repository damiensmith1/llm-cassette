import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCassette } from "../src/session.js";
import { chatReply, fakeNetwork } from "./fixtures.js";

const messagesReply = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-test",
  content: [{ type: "text", text: "receipts" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1, output_tokens: 1 },
};

describe("openCassette", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    path = join(dir, "c.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function chat(fetch: typeof globalThis.fetch, content = "classify this") {
    const client = new OpenAI({ apiKey: "sk-test-key", fetch, maxRetries: 0 });
    const res = await client.chat.completions.create({
      model: "gpt-test",
      messages: [{ role: "user", content }],
    });
    return res.choices[0]?.message.content;
  }

  it("records with the OpenAI SDK, then replays with no network", async () => {
    const net = fakeNetwork(chatReply);
    const rec = await openCassette(path, { mode: "record", fetch: net });
    expect(await chat(rec.fetch)).toBe("receipts");
    await rec.save();
    expect(net).toHaveBeenCalledTimes(1);

    const offline = vi.fn(async () => {
      throw new Error("network used in replay");
    });
    const play = await openCassette(path, { mode: "replay", fetch: offline });
    expect(await chat(play.fetch)).toBe("receipts");
    expect(offline).not.toHaveBeenCalled();
    expect(play.events.map((e) => e.kind)).toEqual(["exact"]);
  });

  it("works with the Anthropic SDK", async () => {
    const net = fakeNetwork(messagesReply);
    const ask = async (fetch: typeof globalThis.fetch) => {
      const client = new Anthropic({ apiKey: "sk-ant-test-key", fetch, maxRetries: 0 });
      const res = await client.messages.create({
        model: "claude-test",
        max_tokens: 10,
        messages: [{ role: "user", content: "classify this" }],
      });
      return res.content[0]?.type === "text" ? res.content[0].text : undefined;
    };
    const rec = await openCassette(path, { mode: "record", fetch: net });
    expect(await ask(rec.fetch)).toBe("receipts");
    await rec.save();

    const play = await openCassette(path, { mode: "replay", fetch: net });
    expect(await ask(play.fetch)).toBe("receipts");
    expect(net).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved.interactions[0].request.provider).toBe("anthropic");
  });

  it("never writes API keys or cookies to the cassette", async () => {
    const rec = await openCassette(path, { mode: "record", fetch: fakeNetwork(chatReply) });
    await chat(rec.fetch);
    await rec.save();
    const text = await readFile(path, "utf8");
    expect(text).not.toContain("sk-test-key");
    expect(text).not.toContain("secret=1");
  });

  it("fails on a miss in replay mode", async () => {
    const rec = await openCassette(path, { mode: "record", fetch: fakeNetwork(chatReply) });
    await chat(rec.fetch);
    await rec.save();

    const play = await openCassette(path, { mode: "replay" });
    await expect(chat(play.fetch, "a different prompt")).rejects.toThrow(/No recording matches/);
    expect(play.events.map((e) => e.kind)).toEqual(["miss"]);
  });

  it("surfaces a miss once, without SDK retries", async () => {
    const play = await openCassette(path, { mode: "replay" });
    const client = new OpenAI({ apiKey: "sk-test-key", fetch: play.fetch }); // default retries on
    await expect(
      client.chat.completions.create({ model: "gpt-test", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/LLM_CASSETTE_MODE=record/);
    expect(play.events).toHaveLength(1);
  });

  it("records only the misses in record mode", async () => {
    const net = fakeNetwork(chatReply);
    const first = await openCassette(path, { mode: "record", fetch: net });
    await chat(first.fetch, "one");
    await first.save();

    const second = await openCassette(path, { mode: "record", fetch: net });
    await chat(second.fetch, "one");
    await chat(second.fetch, "two");
    await second.save();
    expect(net).toHaveBeenCalledTimes(2);
    expect(second.events.map((e) => e.kind)).toEqual(["exact", "recorded"]);
  });

  it("replays repeated identical calls in recorded order", async () => {
    let n = 0;
    const net = vi.fn(async () =>
      new Response(JSON.stringify({ ...chatReply, choices: [{ ...chatReply.choices[0], message: { role: "assistant", content: `r${++n}` } }] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const rec = await openCassette(path, { mode: "record", fetch: net });
    await chat(rec.fetch);
    await chat(rec.fetch);
    await rec.save();

    const play = await openCassette(path, { mode: "replay" });
    expect(await chat(play.fetch)).toBe("r1");
    expect(await chat(play.fetch)).toBe("r2");
    await expect(chat(play.fetch)).rejects.toThrow(/No recording matches/);
  });

  it("re-records everything in refresh mode", async () => {
    const net = fakeNetwork(chatReply);
    const rec = await openCassette(path, { mode: "record", fetch: net });
    await chat(rec.fetch);
    await rec.save();

    const refresh = await openCassette(path, { mode: "refresh", fetch: net });
    await chat(refresh.fetch);
    await refresh.save();
    expect(net).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(path, "utf8")).interactions).toHaveLength(1);
  });

  it("does not write the file when nothing was recorded", async () => {
    const play = await openCassette(path, { mode: "replay" });
    await play.save();
    await expect(readFile(path)).rejects.toThrow();
  });
});
