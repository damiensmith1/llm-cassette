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

export type Resolution =
  | { kind: "replay" | "miss"; response: Response }
  | { kind: "record"; request: RecordedRequest };

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
  /**
   * Decides how to answer a request without touching the network: a replayed
   * response, a miss response, or "record" (the caller performs the request
   * and passes the result to `record`). Used by global interception.
   */
  resolve(req: Request): Promise<Resolution>;
  /** Stores a real response for a request `resolve` said to record. */
  record(request: RecordedRequest, res: Response): Promise<void>;
  readonly events: readonly MatchEvent[];
  /** Waits for in-flight recordings, then writes the cassette if anything was recorded. */
  save(): Promise<void>;
}

export async function openCassette(path: string, options: OpenCassetteOptions = {}): Promise<CassetteSession> {
  const mode = resolveMode(options.mode);
  const realFetch = options.fetch ?? globalThis.fetch;
  const cassette: Cassette = mode === "refresh" ? emptyCassette() : await loadCassette(path);
  const used = new Set<number>();
  const events: MatchEvent[] = [];
  let dirty = mode === "refresh";

  const pending = new Set<Promise<void>>();

  const resolve = async (req: Request): Promise<Resolution> => {
    const recorded = await recordRequest(req, options.provider);
    if (mode === "refresh") return { kind: "record", request: recorded };

    // Repeated identical calls (e.g. a retry loop) replay in recorded order.
    const key = requestKey(recorded);
    const index = cassette.interactions.findIndex(
      (it, i) => !used.has(i) && requestKey(it.request) === key,
    );
    if (index !== -1) {
      used.add(index);
      events.push({ kind: "exact", request: recorded });
      return { kind: "replay", response: replayResponse(cassette.interactions[index]!.response) };
    }
    if (mode === "replay") {
      events.push({ kind: "miss", request: recorded });
      return { kind: "miss", response: missResponse(new CassetteMissError(path, recorded)) };
    }
    return { kind: "record", request: recorded };
  };

  const record = (request: RecordedRequest, res: Response): Promise<void> => {
    const task = recordResponse(res).then((response) => {
      cassette.interactions.push({ request, response, recordedAt: new Date().toISOString() });
      used.add(cassette.interactions.length - 1);
      events.push({ kind: "recorded", request });
      dirty = true;
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
    return task;
  };

  const handle = async (req: Request): Promise<Response> => {
    const r = await resolve(req);
    if (r.kind !== "record") return r.response;
    const res = await realFetch(req);
    await record(r.request, res);
    return res;
  };

  const sessionFetch = (input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init));

  return {
    path,
    mode,
    fetch: sessionFetch as typeof fetch,
    resolve,
    record,
    events,
    async save() {
      await Promise.all(pending);
      if (dirty) await saveCassette(path, cassette);
      dirty = false;
    },
  };
}
