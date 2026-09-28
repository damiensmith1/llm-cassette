import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.js";

describe("package", () => {
  it("loads", () => {
    expect(pkg).toBeDefined();
  });
});
