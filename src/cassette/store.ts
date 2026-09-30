import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "../normalize/canonical.js";
import type { Cassette } from "../types.js";

export function emptyCassette(): Cassette {
  return { version: 1, interactions: [], verdicts: [] };
}

/** Loads a cassette, or returns an empty one if the file doesn't exist. */
export async function loadCassette(path: string): Promise<Cassette> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyCassette();
    throw err;
  }
  const data = JSON.parse(text) as Partial<Cassette>;
  if (data.version !== 1 || !Array.isArray(data.interactions) || !Array.isArray(data.verdicts)) {
    throw new Error(`Unsupported or malformed cassette: ${path}`);
  }
  return data as Cassette;
}

/**
 * Writes sorted-key, pretty JSON so cassettes diff cleanly in PRs. Writes to
 * a temp file and renames it, so parallel workers never see a partial file.
 */
export async function saveCassette(path: string, cassette: Cassette): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, canonicalJson(cassette, 2) + "\n", "utf8");
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
