import { defineConfig } from "tsup";
import type { Options } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";

/**
 * The bundled interceptor code loads its HTTP parser from
 * `new URL("./llhttp/llhttp.wasm", import.meta.url)`, so the .wasm file has
 * to sit next to every CJS bundle that includes it.
 */
function copyWasm() {
  const wasm = "node_modules/@mswjs/interceptors/lib/node/llhttp/llhttp.wasm";
  for (const dir of ["dist/llhttp", "dist/adapters/llhttp"]) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(wasm, `${dir}/llhttp.wasm`);
  }
}

const entry = [
  "src/index.ts",
  "src/adapters/vitest.ts",
  "src/adapters/vitest-reporter.ts",
  "src/adapters/jest.ts",
  "src/adapters/jest-reporter.ts",
];
const shared: Options = { entry, dts: true, sourcemap: true, target: "node22", external: ["vitest", "vitest/node", "jest"] };

export default defineConfig([
  { ...shared, format: "esm", clean: true },
  {
    ...shared,
    format: "cjs",
    // @mswjs/interceptors ships ESM only, which Jest's CommonJS runtime can't
    // load before Node 24.9. Bundle it (and its dependencies) into the CJS build.
    noExternal: [/^@mswjs\//, "rettime", /^@open-draft\//, "outvariant", "strict-event-emitter", "is-node-process"],
    // Gives the bundle a real import.meta.url (this file's own URL).
    shims: true,
    onSuccess: async () => copyWasm(),
  },
]);
