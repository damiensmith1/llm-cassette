import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMode, resolveThreshold } from "../src/config.js";

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

describe("resolveThreshold", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to 0.85", () => {
    vi.stubEnv("LLM_CASSETTE_THRESHOLD", "");
    expect(resolveThreshold()).toBe(0.85);
  });

  it("prefers the explicit option, then the env var", () => {
    vi.stubEnv("LLM_CASSETTE_THRESHOLD", "0.7");
    expect(resolveThreshold(0.95)).toBe(0.95);
    expect(resolveThreshold()).toBe(0.7);
  });

  it("rejects values outside 0–1", () => {
    expect(() => resolveThreshold(1.5)).toThrow(/0 to 1/);
    vi.stubEnv("LLM_CASSETTE_THRESHOLD", "high");
    expect(() => resolveThreshold()).toThrow(/0 to 1/);
  });
});
