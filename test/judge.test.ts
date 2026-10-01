import OpenAI from "openai";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Judge } from "../src/match/jev.js";
import { openCassette } from "../src/session.js";
import type { OpenCassetteOptions } from "../src/session.js";
import { chatReply, fakeNetwork } from "./fixtures.js";

function fakeJudge(p: number): Judge & { judge: ReturnType<typeof vi.fn> } {
  return {
    id: "fake:v1",
    judge: vi.fn(async () => ({ p, signals: { format_changed: 0.01 }, model: "fake-1", inputTokens: 10 })),
  };
}

const throwingJudge = (): Judge => ({
  id: "fake:v1",
  judge: vi.fn(async () => {
    throw new Error("Jev is down");
  }),
});

describe("judged matching", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    path = join(dir, "c.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function ask(options: OpenCassetteOptions, content: string, extra: Record<string, unknown> = {}) {
    const session = await openCassette(path, options);
    const client = new OpenAI({ apiKey: "sk-test-key", fetch: session.fetch, maxRetries: 0 });
    const reply = await client.chat.completions
      .create({ model: "gpt-test", messages: [{ role: "user", content }], ...extra })
      .then((r) => r.choices[0]?.message.content)
      .catch((err: Error) => err);
    await session.save();
    return { session, reply };
  }

  const saved = async () => JSON.parse(await readFile(path, "utf8"));

  beforeEach(async () => {
    await ask({ mode: "record", fetch: fakeNetwork(chatReply), judge: false }, "What is the capital of France?");
  });

  it("replays after a prompt edit the judge accepts, and stores the verdict", async () => {
    const net = fakeNetwork(chatReply);
    const judge = fakeJudge(0.95);
    const { session, reply } = await ask({ mode: "record", fetch: net, judge }, "What's France's capital city?");
    expect(reply).toBe("receipts");
    expect(net).not.toHaveBeenCalled();
    expect(session.events).toMatchObject([{ kind: "judged", p: 0.95 }]);
    expect((await saved()).verdicts).toMatchObject([{ p: 0.95, judge: "fake:v1", model: "fake-1", replay: true }]);
  });

  it("replays from the stored verdict without calling the judge", async () => {
    await ask({ mode: "record", fetch: fakeNetwork(chatReply), judge: fakeJudge(0.95) }, "What's France's capital city?");
    const judge = throwingJudge();
    const { session, reply } = await ask({ mode: "replay", judge }, "What's France's capital city?");
    expect(reply).toBe("receipts");
    expect(judge.judge).not.toHaveBeenCalled();
    expect(session.events).toMatchObject([{ kind: "judged", p: 0.95 }]);
  });

  it("applies the current threshold to stored verdicts", async () => {
    await ask({ mode: "record", fetch: fakeNetwork(chatReply), judge: fakeJudge(0.9) }, "What's France's capital city?");
    const { session, reply } = await ask({ mode: "replay", judge: throwingJudge(), threshold: 0.95 }, "What's France's capital city?");
    expect(reply).toBeInstanceOf(Error);
    expect(session.events).toMatchObject([{ kind: "rejected", p: 0.9 }]);
  });

  it("re-records when the judge rejects, replacing the old recording", async () => {
    const net = fakeNetwork(chatReply);
    const { session } = await ask({ mode: "record", fetch: net, judge: fakeJudge(0.1) }, "What is the capital of Germany?");
    expect(net).toHaveBeenCalledTimes(1);
    expect(session.events[0]).toMatchObject({ kind: "recorded", reason: expect.stringContaining("p=0.10") });
    const cassette = await saved();
    expect(cassette.interactions).toHaveLength(1);
    expect(cassette.interactions[0].request.body.messages[0].content).toBe("What is the capital of Germany?");
    expect(cassette.verdicts).toEqual([]);
  });

  it("fails in replay mode when no verdict is stored, without calling the judge", async () => {
    const judge = fakeJudge(0.99);
    const { session, reply } = await ask({ mode: "replay", judge }, "What's France's capital city?");
    expect(String(reply)).toMatch(/no stored verdict/);
    expect(judge.judge).not.toHaveBeenCalled();
    expect(session.events).toMatchObject([{ kind: "miss" }]);
  });

  it("fails closed when the judge errors", async () => {
    const net = fakeNetwork(chatReply);
    const { session } = await ask({ mode: "record", fetch: net, judge: throwingJudge() }, "What's France's capital city?");
    expect(net).toHaveBeenCalledTimes(1);
    expect(session.events[0]).toMatchObject({ kind: "recorded", reason: expect.stringContaining("Jev is down") });
  });

  it("never asks the judge when a hard check fails", async () => {
    const judge = fakeJudge(0.99);
    const { session } = await ask({ mode: "record", fetch: fakeNetwork(chatReply), judge }, "What's France's capital city?", { temperature: 1 });
    expect(judge.judge).not.toHaveBeenCalled();
    expect(session.events[0]).toMatchObject({ reason: "settings changed: temperature" });
  });
});
