import OpenAI from "openai";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { interceptGlobal } from "../src/intercept/global.js";
import { openCassette } from "../src/session.js";
import { chatReply } from "./fixtures.js";

/** A local stand-in for the OpenAI API that counts requests. */
let server: Server;
let hits = 0;
let baseURL = "";
const hosts = ["127.0.0.1"];

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "secret=1" });
    res.end(JSON.stringify(chatReply));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("interceptGlobal", () => {
  let dir: string;
  let stop: (() => void) | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    hits = 0;
  });
  afterEach(async () => {
    stop?.();
    stop = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("records and replays a client created before interception started", async () => {
    // Like a module-level client: it captured fetch before any patching.
    const client = new OpenAI({ apiKey: "sk-test-key", baseURL, maxRetries: 0 });
    const ask = () =>
      client.chat.completions.create({ model: "gpt-test", messages: [{ role: "user", content: "classify this" }] });
    const path = join(dir, "c.json");

    const rec = await openCassette(path, { mode: "record" });
    stop = interceptGlobal(rec, { hosts });
    expect((await ask()).choices[0]?.message.content).toBe("receipts");
    stop();
    await rec.save();
    expect(hits).toBe(1);
    expect(rec.events.map((e) => e.kind)).toEqual(["recorded"]);

    const play = await openCassette(path, { mode: "replay" });
    stop = interceptGlobal(play, { hosts });
    expect((await ask()).choices[0]?.message.content).toBe("receipts");
    expect(hits).toBe(1);
    expect(play.events.map((e) => e.kind)).toEqual(["exact"]);
  });

  it("lets requests to other hosts pass through", async () => {
    const session = await openCassette(join(dir, "c.json"), { mode: "replay" });
    stop = interceptGlobal(session, { hosts: ["api.openai.com"] });
    const res = await fetch(`${baseURL}/anything`);
    expect(res.status).toBe(200);
    expect(hits).toBe(1);
    expect(session.events).toHaveLength(0);
  });

  it("refuses a second concurrent session", async () => {
    const a = await openCassette(join(dir, "a.json"), { mode: "replay" });
    const b = await openCassette(join(dir, "b.json"), { mode: "replay" });
    stop = interceptGlobal(a);
    expect(() => interceptGlobal(b)).toThrow(/session\.fetch/);
  });
});
