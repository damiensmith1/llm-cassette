import { describe, expect, it } from "vitest";
import { createScrubber, scrubBody, scrubbedKey } from "../src/normalize/scrub.js";
import type { RecordedRequest } from "../src/types.js";

const s = createScrubber()!;
const req = (content: string, extra: Record<string, unknown> = {}): RecordedRequest => ({
  provider: "openai",
  method: "POST",
  url: "https://api.openai.com/v1/chat/completions",
  body: { model: "m", messages: [{ role: "user", content }], ...extra },
});

describe("scrubBody", () => {
  it("replaces ISO dates and datetimes", () => {
    expect(scrubBody("Today is 2026-10-01, now 2026-10-01T09:15:00.120Z.", s)).toBe(
      "Today is <scrubbed>, now <scrubbed>.",
    );
  });

  it("replaces UUIDs in nested strings", () => {
    expect(scrubBody({ a: [{ id: "req 3F2504E0-4F89-11D3-9A0C-0305E82C3301" }] }, s)).toEqual({
      a: [{ id: "req <scrubbed>" }],
    });
  });

  it("drops caller fields at the top level only", () => {
    expect(scrubBody({ user: "u1", metadata: { user_id: "x" }, model: "m", nested: { user: "kept" } }, s)).toEqual({
      model: "m",
      nested: { user: "kept" },
    });
  });

  it("leaves numbers alone", () => {
    expect(scrubBody({ max_tokens: 1700000000 }, s)).toEqual({ max_tokens: 1700000000 });
  });

  it("adds user patterns and fields to the defaults", () => {
    const custom = createScrubber({ patterns: [/order #\d+/i], ignoreFields: ["store"] })!;
    expect(scrubBody({ store: true, q: "Order #123 on 2026-01-01" }, custom)).toEqual({
      q: "<scrubbed> on <scrubbed>",
    });
  });

  it("can be turned off", () => {
    expect(createScrubber(false)).toBeUndefined();
  });
});

describe("scrubbedKey", () => {
  it("matches requests that differ only in volatile values", () => {
    expect(scrubbedKey(req("Date: 2026-09-30", { user: "a" }), s)).toBe(
      scrubbedKey(req("Date: 2026-10-01", { user: "b" }), s),
    );
  });

  it("still separates real content changes", () => {
    expect(scrubbedKey(req("capital of France"), s)).not.toBe(scrubbedKey(req("capital of Germany"), s));
  });
});
