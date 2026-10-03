import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cassettePath as defaultCassettePath } from "../cassette/path.js";
import { interceptGlobal } from "../intercept/global.js";
import type { InterceptOptions } from "../intercept/global.js";
import { openCassette } from "../session.js";
import type { CassetteSession, OpenCassetteOptions } from "../session.js";
import { REPORT_DIR_ENV } from "./jest-env.js";
import { missError, testReport } from "./shared.js";

export interface CassetteTestOptions extends Omit<OpenCassetteOptions, "fetch">, InterceptOptions {
  /**
   * What a replay miss does: `fail` (default) fails the test even if app
   * code caught the SDK error; `warn` only reports it.
   */
  onMiss?: "fail" | "warn";
  /** Where a test's cassette lives. Defaults to `__cassettes__/<file>/<slug>.<hash>.json` next to the test. */
  cassettePath?: (testFile: string, names: readonly string[]) => string;
}


let options: CassetteTestOptions = {};
let current: CassetteSession | undefined;
let stop: (() => void) | undefined;
let names: string[] = [];
let testFile = "";

/**
 * Sets cassette options for the current test file, merged over earlier calls.
 * Call it at the top of a test file or in a setup file.
 */
export function configureCassette(next: CassetteTestOptions): void {
  options = { ...options, ...next };
}

/** The current test's cassette session, e.g. to pass `session.fetch` to a client or read `events`. */
export function useCassette(): CassetteSession {
  if (!current) throw new Error("llm-cassette: useCassette() works only inside a test, with the Jest setup file installed.");
  return current;
}

interface JestGlobals {
  beforeEach(fn: () => Promise<void>): void;
  afterEach(fn: () => Promise<void>): void;
  expect: { getState(): { testPath?: string; currentTestName?: string } };
}

const g = globalThis as unknown as Partial<JestGlobals>;

// Registers hooks when loaded from Jest's `setupFilesAfterEnv`.
if (typeof g.beforeEach === "function" && typeof g.afterEach === "function" && g.expect) {
  const jest = g as JestGlobals;

  jest.beforeEach(async () => {
    const state = jest.expect.getState();
    testFile = state.testPath ?? "unknown.test";
    // Jest joins the describe chain and test name with spaces.
    names = [state.currentTestName ?? "test"];
    const { hosts, onMiss: _onMiss, cassettePath = defaultCassettePath, ...sessionOptions } = options;
    // Capture the real fetch before interception replaces it.
    current = await openCassette(cassettePath(testFile, names), { ...sessionOptions, fetch: globalThis.fetch });
    stop = interceptGlobal(current, hosts ? { hosts } : {});
  });

  jest.afterEach(async () => {
    const session = current;
    if (!session) return;
    stop?.();
    stop = undefined;
    current = undefined;
    await session.save();

    const report = testReport(session, testFile, names);
    const dir = process.env[REPORT_DIR_ENV];
    if (report && dir) writeFileSync(join(dir, `${randomUUID()}.json`), JSON.stringify(report));

    const err = missError(session);
    if (err && (options.onMiss ?? "fail") === "fail") throw err;
  });
}

export type { TestReport } from "../report/summary.js";
