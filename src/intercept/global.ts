import { HttpRequestInterceptor } from "@mswjs/interceptors/http";
import type { CassetteSession } from "../session.js";
import type { RecordedRequest } from "../types.js";
import { decodeBody } from "./encoding.js";

export const DEFAULT_HOSTS: readonly string[] = ["api.openai.com", "api.anthropic.com", "openrouter.ai"];

export interface InterceptOptions {
  /** Hosts whose requests go through the cassette. Everything else passes through untouched. */
  hosts?: readonly string[];
}

let active: CassetteSession | undefined;

/**
 * Routes HTTP requests to LLM hosts through `session`. Returns a function
 * that stops interception.
 *
 * Interception happens at the socket level, not by patching `fetch`: the
 * SDKs capture `fetch` when a client is constructed, so a client created at
 * import time (`export const openai = new OpenAI()`) would bypass a patch
 * applied later by a test fixture.
 *
 * Only one session can intercept at a time per process: with `test.concurrent`
 * there's no way to tell which test a request belongs to, so pass
 * `session.fetch` to the client instead.
 */
export function interceptGlobal(session: CassetteSession, options: InterceptOptions = {}): () => void {
  if (active) {
    throw new Error(
      `llm-cassette: ${active.path} is already intercepting HTTP. ` +
        `For concurrent tests, pass session.fetch to the SDK client instead.`,
    );
  }
  const hosts = new Set(options.hosts ?? DEFAULT_HOSTS);
  const toRecord = new Map<string, { request: RecordedRequest; reason?: string }>();
  const interceptor = new HttpRequestInterceptor();

  interceptor.on("request", async ({ request, requestId, controller }) => {
    if (!hosts.has(new URL(request.url).hostname)) return;
    const r = await session.resolve(request);
    if (r.kind === "record") {
      // Ask for an uncompressed reply; decodeBody covers servers that compress anyway.
      request.headers.set("accept-encoding", "identity");
      toRecord.set(requestId, r.reason === undefined ? { request: r.request } : { request: r.request, reason: r.reason });
      return; // No response given: the request goes to the real API.
    }
    controller.respondWith(r.response);
  });

  interceptor.on("response", ({ response, requestId, responseType }) => {
    const pending = toRecord.get(requestId);
    if (!pending || responseType !== "original") return;
    toRecord.delete(requestId);
    void decodeBody(response).then((decoded) => session.record(pending.request, decoded, pending.reason));
  });

  interceptor.apply();
  active = session;

  return () => {
    interceptor.dispose();
    if (active === session) active = undefined;
  };
}
