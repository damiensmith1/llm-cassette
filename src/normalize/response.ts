import type { RecordedResponse } from "../types.js";
import { isEventStream, parseSse, sseStream } from "./stream.js";

/** Response headers never worth keeping: they are secret or per-run. */
const DROP_HEADERS = new Set(["set-cookie", "content-length", "content-encoding", "transfer-encoding"]);

export async function recordResponse(res: Response): Promise<RecordedResponse> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, name) => {
    if (!DROP_HEADERS.has(name)) headers[name] = value;
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
