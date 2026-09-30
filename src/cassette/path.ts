import { basename, dirname, join } from "node:path";
import { hashOf } from "../normalize/canonical.js";

const MAX_SLUG = 80;

/**
 * Where a test's cassette lives, next to the test file like `__snapshots__`:
 * `<dir>/__cassettes__/<file>/<slug>.<hash>.json`.
 *
 * `names` is the describe chain plus the test name. The short hash of the
 * full chain keeps two tests whose names slug the same from sharing a file.
 */
export function cassettePath(testFile: string, names: readonly string[]): string {
  const slug =
    names
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG) || "test";
  const id = hashOf(names).slice(0, 8);
  return join(dirname(testFile), "__cassettes__", basename(testFile), `${slug}.${id}.json`);
}
