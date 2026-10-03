import type { RecordedResponse } from "../types.js";
import { isEventStream, parseSse, sseStream } from "./stream.js";

/**
 * The only response headers recorded. Everything else is per-run noise
 * (dates, rate limits, request ids) or identifies the account (organization
 * and workspace ids, cookies), which mustn't end up in a public repo.
 * These are the ones the SDKs act on.
 */
export const KEEP_HEADERS: readonly string[] = ["content-type", "retry-after", "x-should-retry"];

export async function recordResponse(res: Response): Promise<RecordedResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, name) => {
    if (KEEP_HEADERS.includes(name)) headers[name] = value;
  });
  const text = await res.clone().text();
  if (isEventStream(headers["content-type"])) {
    return { status: res.status, headers, body: null, events: parseSse(text) };
  }
  let body: unknown = text;
  if (headers["content-type"]?.includes("json")) {
    try {
      body = JSON.parse(text);
    } catch {
      // Keep malformed JSON as text so it replays byte for byte.
    }
  }
  return { status: res.status, headers, body, events: null };
}

/** Rebuilds a fetch Response; streamed recordings replay as a stream, one event per chunk. */
export function replayResponse(recorded: RecordedResponse): Response {
  if (recorded.events) {
    return new Response(sseStream(recorded.events), { status: recorded.status, headers: recorded.headers });
  }
  const body = typeof recorded.body === "string" ? recorded.body : JSON.stringify(recorded.body);
  return new Response(body, { status: recorded.status, headers: recorded.headers });
}
