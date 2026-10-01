import { test as base } from "vitest";
import type { Suite, Test } from "vitest";
import { cassettePath } from "../cassette/path.js";
import { interceptGlobal } from "../intercept/global.js";
import type { InterceptOptions } from "../intercept/global.js";
import { openCassette } from "../session.js";
import type { CassetteSession, OpenCassetteOptions } from "../session.js";

export interface CassetteTestOptions extends Omit<OpenCassetteOptions, "fetch">, InterceptOptions {}

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
 * A Vitest `test` where every test gets its own cassette and LLM calls made
 * through global `fetch` are recorded or replayed automatically. A replay
 * miss fails the test even if the app code caught the SDK error.
 */
export function createTest(options: CassetteTestOptions = {}) {
  const { hosts, ...sessionOptions } = options;
  return base.extend<CassetteFixtures>({
    cassette: [
      async ({ task }, use) => {
        const path = cassettePath(task.file.filepath, testNames(task));
        // Capture the real fetch before interception replaces it.
        const session = await openCassette(path, { ...sessionOptions, fetch: globalThis.fetch });
        const stop = interceptGlobal(session, hosts ? { hosts } : {});
        try {
          await use(session);
        } finally {
          stop();
          await session.save();
        }
        const misses = session.events.filter((e) => e.kind === "miss");
        if (misses.length > 0) {
          const list = misses.map((m) => `  ${m.request.method} ${m.request.url}: ${m.reason ?? "no match"}`).join("\n");
          throw new Error(
            `llm-cassette: ${misses.length} request(s) had no recording in ${path}:\n${list}\n` +
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
