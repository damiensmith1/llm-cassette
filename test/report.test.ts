import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import CassetteReporter from "../src/adapters/vitest-reporter.js";
import { formatSummary, summarize } from "../src/report/summary.js";
import type { TestReport } from "../src/report/summary.js";

const URL_ = "https://api.openai.com/v1/chat/completions";
const report = (test: string, events: TestReport["events"]): TestReport => ({
  test, file: "test/a.test.ts", cassette: "test/__cassettes__/a.json", mode: "record", threshold: 0.85, events,
});
const tests = [
  report("classifies receipts", [{ kind: "exact", method: "POST", url: URL_ }]),
  report("summarizes", [
    { kind: "judged", method: "POST", url: URL_, p: 0.97 },
    { kind: "recorded", method: "POST", url: URL_, reason: "settings changed: temperature" },
  ]),
];

describe("summarize", () => {
  it("counts every kind", () => {
    expect(summarize(tests).totals).toEqual({ exact: 1, scrubbed: 0, judged: 1, rejected: 0, recorded: 1, miss: 0 });
  });
});

describe("formatSummary", () => {
  it("lists changes by default and skips exact hits", () => {
    expect(formatSummary(summarize(tests))).toBe(
      [
        "llm-cassette: 1 exact, 1 judged, 1 recorded",
        "  summarizes (test/a.test.ts)",
        "    judged p=0.97: POST /v1/chat/completions",
        "    recorded: POST /v1/chat/completions — settings changed: temperature",
      ].join("\n"),
    );
  });

  it("prints totals only with detail none, and every request with all", () => {
    expect(formatSummary(summarize(tests), "none")).toBe("llm-cassette: 1 exact, 1 judged, 1 recorded");
    expect(formatSummary(summarize(tests), "all")).toContain("exact: POST /v1/chat/completions");
  });
});

describe("CassetteReporter", () => {
  let dir: string | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const feed = async (reporter: CassetteReporter) => {
    reporter.onTestRunStart();
    for (const t of tests) reporter.onTestCaseResult({ meta: () => ({ llmCassette: t }) } as never);
    reporter.onTestCaseResult({ meta: () => ({}) } as never);
    await reporter.onTestRunEnd();
  };

  it("prints the summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await feed(new CassetteReporter({ detail: "none" }));
    expect(log).toHaveBeenCalledWith("\nllm-cassette: 1 exact, 1 judged, 1 recorded\n");
  });

  it("reads the detail level from LLM_CASSETTE_REPORT", async () => {
    vi.stubEnv("LLM_CASSETTE_REPORT", "none");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await feed(new CassetteReporter());
    expect(log.mock.calls[0]?.[0]).not.toContain("summarizes");
    vi.stubEnv("LLM_CASSETTE_REPORT", "loud");
    expect(() => new CassetteReporter()).toThrow(/LLM_CASSETTE_REPORT/);
  });

  it("writes JSON and hands the summary to onReport instead of printing", async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassette-"));
    const outputFile = join(dir, "out", "report.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const onReport = vi.fn();
    await feed(new CassetteReporter({ outputFile, onReport }));
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ tests }));
    expect(JSON.parse(await readFile(outputFile, "utf8")).totals.judged).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });
});
