import { loadCassette, saveCassette, emptyCassette } from "./cassette/store.js";
import { resolveMode } from "./config.js";
import { recordRequest, requestKey } from "./normalize/request.js";
import { recordResponse, replayResponse } from "./normalize/response.js";
import type { Cassette, MatchKind, Mode, Provider, RecordedRequest } from "./types.js";

export interface OpenCassetteOptions {
  mode?: Mode;
  /** Force the provider instead of detecting it from the URL (for proxies or custom base URLs). */
  provider?: Provider;
  /** The real fetch used when recording. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** One entry per request this session handled, for the run report. */
export interface MatchEvent {
  kind: MatchKind | "recorded";
  request: RecordedRequest;
}

export class CassetteMissError extends Error {
  constructor(path: string, req: RecordedRequest) {
    super(
      `No recording matches ${req.method} ${req.url} in ${path}. ` +
        `Run with LLM_CASSETTE_MODE=record to record it.`,
    );
    this.name = "CassetteMissError";
  }
}

/**
 * A miss is returned as an HTTP 400 rather than thrown: the SDKs wrap thrown
 * fetch errors as a generic "Connection error" and retry them, hiding the
 * message. A 400 with `x-should-retry: false` surfaces it once, verbatim.
 * The miss is also in `session.events`, so adapters can fail the test even
 * if app code swallows the error.
 */
function missResponse(err: CassetteMissError): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type: "llm_cassette_miss", message: err.message } }),
    {
      status: 400,
      headers: { "content-type": "application/json", "x-should-retry": "false", "x-llm-cassette": "miss" },
    },
  );
}

export interface CassetteSession {
  readonly path: string;
  readonly mode: Mode;
  /** Pass as the SDK's `fetch` option: `new OpenAI({ fetch: session.fetch })`. */
  readonly fetch: typeof fetch;
  readonly events: readonly MatchEvent[];
  /** Writes the cassette if anything was recorded. */
  save(): Promise<void>;
}

export async function openCassette(path: string, options: OpenCassetteOptions = {}): Promise<CassetteSession> {
  const mode = resolveMode(options.mode);
  const realFetch = options.fetch ?? globalThis.fetch;
  const cassette: Cassette = mode === "refresh" ? emptyCassette() : await loadCassette(path);
  const used = new Set<number>();
  const events: MatchEvent[] = [];
  let dirty = mode === "refresh";

  const sessionFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const recorded = await recordRequest(req, options.provider);

    if (mode !== "refresh") {
      // Repeated identical calls (e.g. a retry loop) replay in recorded order.
      const key = requestKey(recorded);
      const index = cassette.interactions.findIndex(
        (it, i) => !used.has(i) && requestKey(it.request) === key,
      );
      if (index !== -1) {
        used.add(index);
        events.push({ kind: "exact", request: recorded });
        return replayResponse(cassette.interactions[index]!.response);
      }
      if (mode === "replay") {
        events.push({ kind: "miss", request: recorded });
        return missResponse(new CassetteMissError(path, recorded));
      }
    }

    const res = await realFetch(req);
    cassette.interactions.push({
      request: recorded,
      response: await recordResponse(res),
      recordedAt: new Date().toISOString(),
    });
    used.add(cassette.interactions.length - 1);
    events.push({ kind: "recorded", request: recorded });
    dirty = true;
    return res;
  };

  return {
    path,
    mode,
    fetch: sessionFetch as typeof fetch,
    events,
    async save() {
      if (dirty) await saveCassette(path, cassette);
      dirty = false;
    },
  };
}
