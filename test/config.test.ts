import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMode } from "../src/config.js";

describe("resolveMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the explicit option", () => {
    vi.stubEnv("LLM_CASSETTE_MODE", "record");
    expect(resolveMode("replay")).toBe("replay");
  });

  it("reads LLM_CASSETTE_MODE", () => {
    vi.stubEnv("LLM_CASSETTE_MODE", "refresh");
    expect(resolveMode()).toBe("refresh");
  });

  it("rejects unknown modes", () => {
    vi.stubEnv("LLM_CASSETTE_MODE", "sometimes");
    expect(() => resolveMode()).toThrow(/LLM_CASSETTE_MODE/);
  });

  it("defaults to replay on CI and record elsewhere", () => {
    vi.stubEnv("LLM_CASSETTE_MODE", "");
    vi.stubEnv("CI", "true");
    expect(resolveMode()).toBe("replay");
    vi.stubEnv("CI", "");
    expect(resolveMode()).toBe("record");
  });
});
