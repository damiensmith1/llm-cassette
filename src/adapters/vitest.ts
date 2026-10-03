import { relative } from "node:path";
import { test as base } from "vitest";
import type { Suite, Test } from "vitest";
import { cassettePath as defaultCassettePath } from "../cassette/path.js";
import { interceptGlobal } from "../intercept/global.js";
import type { InterceptOptions } from "../intercept/global.js";
import { toReportEvents } from "../report/summary.js";
import type { TestReport } from "../report/summary.js";
import { openCassette } from "../session.js";
import type { CassetteSession, OpenCassetteOptions } from "../session.js";

declare module "vitest" {
  interface TaskMeta {
    /** Set by the cassette fixture; read by `@damiensmith1/llm-cassette/vitest/reporter`. */
    llmCassette?: TestReport;
  }
}

export interface CassetteTestOptions extends Omit<OpenCassetteOptions, "fetch">, InterceptOptions {
  /**
   * What a replay miss does: `fail` (default) fails the test even if app
   * code caught the SDK error; `warn` only reports it.
   */
  onMiss?: "fail" | "warn";
  /** Where a test's cassette lives. Defaults to `__cassettes__/<file>/<slug>.<hash>.json` next to the test. */
  cassettePath?: (testFile: string, names: readonly string[]) => string;
}

export interface CassetteFixtures {
  cassette: CassetteSession;
}

/** The describe chain plus the test name, outermost first. */
function testNames(task: Test): string[] {
  const names = [task.name];
  for (let s: Suite | undefined = task.suite; s && s !== task.file; s = s.suite) names.unshift(s.name);
  return names;
}

/**
 * A Vitest `test` where every test gets its own cassette and LLM calls are
 * recorded or replayed automatically. See `CassetteTestOptions`.
 */
export function createTest(options: CassetteTestOptions = {}) {
  const { hosts, onMiss = "fail", cassettePath = defaultCassettePath, ...sessionOptions } = options;
  return base.extend<CassetteFixtures>({
    cassette: [
      async ({ task }, use) => {
        const names = testNames(task);
        const path = cassettePath(task.file.filepath, names);
        // Capture the real fetch before interception replaces it.
        const session = await openCassette(path, { ...sessionOptions, fetch: globalThis.fetch });
        const stop = interceptGlobal(session, hosts ? { hosts } : {});
        try {
          await use(session);
        } finally {
          stop();
          await session.save();
          if (session.events.length > 0) {
            task.meta.llmCassette = {
              test: names.join(" > "),
              file: relative(process.cwd(), task.file.filepath),
              cassette: relative(process.cwd(), path),
              mode: session.mode,
              threshold: session.threshold,
              events: toReportEvents(session.events),
            };
          }
        }
        const misses = session.events.filter((e) => e.kind === "miss" || e.kind === "rejected");
        if (misses.length > 0 && onMiss === "fail") {
          const list = misses.map((m) => `  ${m.request.method} ${m.request.url}: ${m.reason ?? "no match"}`).join("\n");
          throw new Error(
            `llm-cassette: ${misses.length} request(s) had no usable recording in ${path}:\n${list}\n` +
              `Run with LLM_CASSETTE_MODE=record to record them.`,
          );
        }
      },
      { auto: true },
    ],
  });
}

export const test = createTest();
export const it = test;
export type { TestReport } from "../report/summary.js";
