import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs real Jest (in worker processes) against the built package. Needs `npm run build` first.
const run = promisify(execFile);
const dist = resolve("dist/adapters");
const jestBin = resolve("node_modules/.bin/jest");
const built = existsSync(join(dist, "jest.cjs"));

const config = `module.exports = {
  testMatch: ["**/*.test.cjs"],
  testEnvironment: "node",
  setupFilesAfterEnv: [${JSON.stringify(join(dist, "jest.cjs"))}],
  reporters: ["default", [${JSON.stringify(join(dist, "jest-reporter.cjs"))}, { detail: "all" }]],
};`;

/** A test file that calls a fake OpenAI endpoint on a fixed port with plain fetch. */
const testFile = (name: string, port: number) => `
const http = require("node:http");
const { configureCassette, useCassette } = require(${JSON.stringify(join(dist, "jest.cjs"))});
configureCassette({ hosts: ["127.0.0.1"], judge: false });

let server;
beforeAll(async () => {
  if (!process.env.FIXTURE_SERVER) return;
  server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "receipts" } }] }));
  });
  await new Promise((r) => server.listen(${port}, "127.0.0.1", r));
});
afterAll(() => server && new Promise((r) => server.close(r)));

describe("classify", () => {
  test(${JSON.stringify(name)}, async () => {
    const res = await fetch("http://127.0.0.1:${port}/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-test", messages: [{ role: "user", content: process.env.PROMPT || "Your order shipped" }] }),
    });
    expect((await res.json()).choices[0].message.content).toBe("receipts");
    expect(useCassette().events).toHaveLength(1);
  });
});`;

(built ? describe : describe.skip)("jest adapter (real Jest)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-jest-"));
    await writeFile(join(dir, "jest.config.cjs"), config);
    await writeFile(join(dir, "a.test.cjs"), testFile("labels receipts", 45871));
    await writeFile(join(dir, "b.test.cjs"), testFile("labels more receipts", 45872));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const jest = async (env: Record<string, string>) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [jestBin, "--maxWorkers=2", "--ci=false"], {
        cwd: dir,
        env: { ...process.env, CI: "", ...env },
      });
      return { code: 0, out: stdout + stderr };
    } catch (err) {
      const e = err as { code: number; stdout: string; stderr: string };
      return { code: e.code, out: e.stdout + e.stderr };
    }
  };

  it("records, writes a cassette per test, and reports across workers", async () => {
    const { code, out } = await jest({ LLM_CASSETTE_MODE: "record", FIXTURE_SERVER: "1" });
    expect(out).toContain("llm-cassette: 2 recorded");
    expect(code).toBe(0);
    expect(await readdir(join(dir, "__cassettes__"))).toEqual(["a.test.cjs", "b.test.cjs"]);
  }, 60_000);

  it("replays with no server", async () => {
    const { code, out } = await jest({ LLM_CASSETTE_MODE: "replay" });
    expect(out).toContain("llm-cassette: 2 exact");
    expect(code).toBe(0);
  }, 60_000);

  it("fails a test whose request has no recording", async () => {
    const { code, out } = await jest({ LLM_CASSETTE_MODE: "replay", PROMPT: "something else" });
    expect(code).not.toBe(0);
    expect(out).toContain("had no usable recording");
    expect(out).toContain("2 miss");
  }, 60_000);
});
