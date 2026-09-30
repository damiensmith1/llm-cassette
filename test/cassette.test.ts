import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cassettePath } from "../src/cassette/path.js";
import { emptyCassette, loadCassette, saveCassette } from "../src/cassette/store.js";
import type { Cassette } from "../src/types.js";

const sample: Cassette = {
  version: 1,
  interactions: [
    {
      request: { provider: "openai", method: "POST", url: "https://api.openai.com/v1/chat/completions", body: { model: "m" } },
      response: { status: 200, headers: {}, body: { id: "x" }, events: null },
      recordedAt: "2026-09-30T00:00:00Z",
    },
  ],
  verdicts: [],
};

describe("cassettePath", () => {
  it("puts cassettes next to the test file", () => {
    const p = cassettePath("/repo/test/classify.test.ts", ["classify", "handles receipts"]);
    expect(p).toMatch(/^\/repo\/test\/__cassettes__\/classify\.test\.ts\/classify-handles-receipts\.[0-9a-f]{8}\.json$/);
  });

  it("gives names that slug the same different files", () => {
    const a = cassettePath("/t/a.test.ts", ["Hello, world"]);
    const b = cassettePath("/t/a.test.ts", ["hello world"]);
    expect(a).not.toBe(b);
  });
});

describe("cassette store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty cassette when the file is missing", async () => {
    expect(await loadCassette(join(dir, "missing.json"))).toEqual(emptyCassette());
  });

  it("round-trips and creates parent directories", async () => {
    const path = join(dir, "nested", "c.json");
    await saveCassette(path, sample);
    expect(await loadCassette(path)).toEqual(sample);
  });

  it("writes sorted-key pretty JSON and leaves no temp files", async () => {
    const path = join(dir, "c.json");
    await saveCassette(path, sample);
    const text = await readFile(path, "utf8");
    expect(text.indexOf('"interactions"')).toBeLessThan(text.indexOf('"verdicts"'));
    expect(text.indexOf('"verdicts"')).toBeLessThan(text.indexOf('"version"'));
    expect(text.endsWith("}\n")).toBe(true);
    expect(await readdir(dir)).toEqual(["c.json"]);
  });

  it("rejects malformed cassettes", async () => {
    const path = join(dir, "bad.json");
    await saveCassette(path, { version: 2 } as unknown as Cassette);
    await expect(loadCassette(path)).rejects.toThrow(/malformed/);
  });
});
