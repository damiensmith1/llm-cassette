import type { Provider, RecordedRequest } from "../types.js";
import { canonicalize, hashOf } from "./canonical.js";

/** Anthropic's Messages API lives at /v1/messages; everything else is treated as OpenAI-shaped. */
export function detectProvider(url: string): Provider {
  return new URL(url).pathname.endsWith("/messages") ? "anthropic" : "openai";
}

/**
 * Turns an outgoing request into its recorded form. Headers are left out
 * entirely: they carry the API key and per-run noise (`X-Stainless-*`).
 */
export async function recordRequest(req: Request, provider?: Provider): Promise<RecordedRequest> {
  const text = await req.clone().text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON bodies are kept as text.
    }
  }
  return {
    provider: provider ?? detectProvider(req.url),
    method: req.method,
    url: req.url,
    body: canonicalize(body),
  };
}

/** The exact-match key: method, URL and canonical body. */
export function requestKey(req: RecordedRequest): string {
  return hashOf({ method: req.method, url: req.url, body: req.body });
}
