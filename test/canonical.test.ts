import { describe, expect, it } from "vitest";
import { canonicalJson, hashOf } from "../src/normalize/canonical.js";

describe("canonicalJson", () => {
  it("sorts keys recursively and keeps array order", () => {
    const value = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } };
    expect(canonicalJson(value)).toBe('{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("drops undefined properties like JSON.stringify", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe("hashOf", () => {
  it("ignores key order", () => {
    expect(hashOf({ model: "m", messages: [] })).toBe(hashOf({ messages: [], model: "m" }));
  });

  it("changes when content changes", () => {
    expect(hashOf({ messages: ["a"] })).not.toBe(hashOf({ messages: ["b"] }));
  });
});
