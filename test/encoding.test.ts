import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { interceptGlobal } from "../src/intercept/global.js";
import { openCassette } from "../src/session.js";

const message = {
  id: "msg_1", type: "message", role: "assistant", model: "claude-test",
  content: [{ type: "text", text: "Paris" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
};
const sse = [
  ["message_start", { type: "message_start", message: { ...message, content: [], stop_reason: null } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Paris" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
  ["message_stop", { type: "message_stop" }],
].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

/** Like a CDN that compresses no matter what the client asks for. */
let server: Server;
let baseURL = "";
let encoding: "gzip" | "br" = "gzip";
let lastHeaders: IncomingHttpHeaders = {};

beforeAll(async () => {
  server = createServer(async (req, res) => {
    lastHeaders = req.headers;
    let body = "";
    for await (const chunk of req) body += chunk;
    const stream = body.includes('"stream":true');
    const raw = stream ? sse : JSON.stringify(message);
    res.writeHead(200, {
      "content-type": stream ? "text/event-stream; charset=utf-8" : "application/json",
      "content-encoding": encoding,
      "anthropic-organization-id": "org-secret-123",
      "request-id": "req_abc",
    });
    res.end(encoding === "gzip" ? gzipSync(raw) : brotliCompressSync(raw));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("compressed responses through interception", () => {
  let dir: string;
  let stop: (() => void) | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
  });
  afterEach(async () => {
    stop?.();
    stop = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  const client = () => new Anthropic({ apiKey: "sk-ant-test-key", baseURL, maxRetries: 0 });
  const params = { model: "claude-test", max_tokens: 10, messages: [{ role: "user" as const, content: "capital of France?" }] };

  async function roundTrip<T>(path: string, call: () => Promise<T>) {
    const rec = await openCassette(path, { mode: "record" });
    stop = interceptGlobal(rec, { hosts: ["127.0.0.1"] });
    const recorded = await call();
    stop();
    await rec.save();
    const play = await openCassette(path, { mode: "replay" });
    stop = interceptGlobal(play, { hosts: ["127.0.0.1"] });
    const replayed = await call();
    return { recorded, replayed, saved: JSON.parse(await readFile(path, "utf8")) };
  }

  for (const enc of ["gzip", "br"] as const) {
    it(`records ${enc} JSON decoded`, async () => {
      encoding = enc;
      const text = async () => {
        const m = await client().messages.create(params);
        return m.content[0]?.type === "text" ? m.content[0].text : "";
      };
      const { recorded, replayed, saved } = await roundTrip(join(dir, "j.json"), text);
      expect(recorded).toBe("Paris");
      expect(replayed).toBe("Paris");
      expect(saved.interactions[0].response.body.content[0].text).toBe("Paris");
      expect(lastHeaders["accept-encoding"]).toBe("identity");
    });
  }

  it("records a gzip stream as events", async () => {
    encoding = "gzip";
    const text = async () => {
      const m = await client().messages.stream(params).finalMessage();
      return m.content[0]?.type === "text" ? m.content[0].text : "";
    };
    const { recorded, replayed, saved } = await roundTrip(join(dir, "s.json"), text);
    expect(recorded).toBe("Paris");
    expect(replayed).toBe("Paris");
    expect(saved.interactions[0].response.events).toHaveLength(6);
  });

  it("keeps only the headers the SDKs use", async () => {
    encoding = "gzip";
    const { saved } = await roundTrip(join(dir, "h.json"), () => client().messages.create(params));
    expect(saved.interactions[0].response.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.stringify(saved)).not.toContain("org-secret-123");
  });
});
