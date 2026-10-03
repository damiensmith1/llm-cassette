import { loadCassette, saveCassette, emptyCassette } from "./cassette/store.js";
import { resolveMode, resolveThreshold } from "./config.js";
import { recordRequest, requestKey } from "./normalize/request.js";
import { recordResponse, replayResponse } from "./normalize/response.js";
import { createScrubber, scrubbedKey } from "./normalize/scrub.js";
import { pickCandidate } from "./match/candidate.js";
import { hardChecks } from "./match/hardChecks.js";
import { createJevJudge, verdictKey } from "./match/jev.js";
import type { Judge } from "./match/jev.js";
import type { ScrubOptions } from "./normalize/scrub.js";
import type { Cassette, MatchKind, Mode, Provider, RecordedRequest, Verdict } from "./types.js";


export interface OpenCassetteOptions {
  mode?: Mode;
  /** Force the provider instead of detecting it from the URL (for proxies or custom base URLs). */
  provider?: Provider;
  /**
   * Second matching rung: timestamps, UUIDs and caller fields (`user`,
   * `metadata`) are ignored when no exact match exists. `false` disables it.
   */
  scrub?: ScrubOptions | false;
  /**
   * Last rung: decides whether a recording is still valid after a prompt-text
   * edit. Defaults to Jev; only called in record/refresh mode. `false` turns
   * judging off, so text edits always re-record.
   */
  judge?: Judge | false;
  /** Minimum probability from the judge to replay. Falls back to `LLM_CASSETTE_THRESHOLD`, then 0.85. */
  threshold?: number;
  /** The real fetch used when recording. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

export type Resolution =
  | { kind: "replay" | "miss"; response: Response }
  | { kind: "record"; request: RecordedRequest; reason?: string };

/** One entry per request this session handled, for the run report. */
export interface MatchEvent {
  kind: MatchKind | "recorded";
  request: RecordedRequest;
  /** Why no recording was replayed, for misses and re-records. */
  reason?: string;
  /** The judge's probability, when one was consulted. */
  p?: number;
}

export class CassetteMissError extends Error {
  constructor(path: string, req: RecordedRequest, reason: string) {
    super(
      `No recording matches ${req.method} ${req.url} in ${path} (${reason}). ` +
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
  /** The judge threshold in effect. */
  readonly threshold: number;
  /** Pass as the SDK's `fetch` option: `new OpenAI({ fetch: session.fetch })`. */
  readonly fetch: typeof fetch;
  /**
   * Decides how to answer a request without touching the network: a replayed
   * response, a miss response, or "record" (the caller performs the request
   * and passes the result to `record`). Used by global interception.
   */
  resolve(req: Request): Promise<Resolution>;
  /** Stores a real response for a request `resolve` said to record. */
  record(request: RecordedRequest, res: Response, reason?: string): Promise<void>;
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
  const scrubber = createScrubber(options.scrub);
  const judge = options.judge === false ? undefined : (options.judge ?? createJevJudge());
  const threshold = resolveThreshold(options.threshold);
  let calls = 0;

  /**
   * Recordings a re-record replaces, removed on save along with their verdicts.
   * Keyed by the new request object that `record()` receives.
   */
  const supersedes = new Map<RecordedRequest, { index: number; verdict?: string }>();
  const superseded = new Set<number>();
  const staleVerdicts = new Set<string>();

  /** First unused recording whose key matches, so repeated calls replay in order. */
  const findUnused = (key: string, keyOf: (req: RecordedRequest) => string): number =>
    cassette.interactions.findIndex((it, i) => !used.has(i) && keyOf(it.request) === key);

  const replay = (index: number, kind: MatchKind, request: RecordedRequest, p?: number): Resolution => {
    used.add(index);
    events.push(p === undefined ? { kind, request } : { kind, request, p });
    return { kind: "replay", response: replayResponse(cassette.interactions[index]!.response) };
  };

  /**
   * Hard checks, then the stored verdict or a fresh judgment. Returns a
   * replay, or the reason it can't replay. Fails closed: no verdict, no key
   * or a judge error never replays.
   */
  const judgeNearMiss = async (
    callIndex: number,
    req: RecordedRequest,
  ): Promise<Resolution | { reason: string; p?: number; fresh?: true }> => {
    const candidate = pickCandidate(cassette, used, callIndex, req);
    if (candidate === -1) return { reason: "no recording for this request", fresh: true };
    used.add(candidate); // Claim it before any await, so concurrent calls don't share it.
    const recording = cassette.interactions[candidate]!;
    supersedes.set(req, { index: candidate });

    const check = hardChecks(recording, req, scrubber);
    if (!check.ok) return { reason: check.reason };
    if (!judge) return { reason: "prompt text changed and judging is off" };

    const key = verdictKey(recording.request, req, judge.id);
    supersedes.set(req, { index: candidate, verdict: key });
    let verdict = cassette.verdicts.find((v) => v.key === key);
    if (!verdict) {
      if (mode === "replay") return { reason: "prompt text changed and there's no stored verdict" };
      try {
        const j = await judge.judge({ old: recording.request, next: req, response: recording.response });
        verdict = { key, model: j.model, judge: judge.id, p: j.p, signals: j.signals, threshold, replay: j.p >= threshold };
        cassette.verdicts.push(verdict);
        dirty = true;
      } catch (err) {
        return { reason: `couldn't judge the prompt change: ${(err as Error).message}` };
      }
    }
    if (verdict.p >= threshold) {
      supersedes.delete(req);
      return replay(candidate, "judged", req, verdict.p);
    }
    const signals = Object.entries(verdict.signals).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ");
    return { reason: `judge says the recording no longer fits (p=${verdict.p.toFixed(2)} < ${threshold}${signals ? `; ${signals}` : ""})`, p: verdict.p };
  };

  const resolve = async (req: Request): Promise<Resolution> => {
    const callIndex = calls++;
    const recorded = await recordRequest(req, options.provider);
    if (mode === "refresh") return { kind: "record", request: recorded };

    const exact = findUnused(requestKey(recorded), requestKey);
    if (exact !== -1) return replay(exact, "exact", recorded);
    if (scrubber) {
      const keyOf = (req: RecordedRequest) => scrubbedKey(req, scrubber);
      const scrubbed = findUnused(keyOf(recorded), keyOf);
      if (scrubbed !== -1) return replay(scrubbed, "scrubbed", recorded);
    }
    const near = await judgeNearMiss(callIndex, recorded);
    if ("kind" in near) return near;
    if (mode === "replay") {
      supersedes.delete(recorded);
      const { fresh: _fresh, ...detail } = near;
      events.push({ kind: near.p === undefined ? "miss" : "rejected", request: recorded, ...detail });
      return { kind: "miss", response: missResponse(new CassetteMissError(path, recorded, near.reason)) };
    }
    // A brand-new request needs no explanation; a replaced recording does.
    return near.fresh ? { kind: "record", request: recorded } : { kind: "record", request: recorded, reason: near.reason };
  };

  const record = (request: RecordedRequest, res: Response, reason?: string): Promise<void> => {
    const task = recordResponse(res).then((response) => {
      cassette.interactions.push({ request, response, recordedAt: new Date().toISOString() });
      used.add(cassette.interactions.length - 1);
      events.push(reason === undefined ? { kind: "recorded", request } : { kind: "recorded", request, reason });
      const old = supersedes.get(request);
      if (old) {
        superseded.add(old.index);
        if (old.verdict) staleVerdicts.add(old.verdict);
        supersedes.delete(request);
      }
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
    await record(r.request, res, r.reason);
    return res;
  };

  const sessionFetch = (input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init));

  return {
    path,
    mode,
    threshold,
    fetch: sessionFetch as typeof fetch,
    resolve,
    record,
    events,
    async save() {
      await Promise.all(pending);
      if (!dirty) return;
      await saveCassette(path, {
        ...cassette,
        interactions: cassette.interactions.filter((_, i) => !superseded.has(i)),
        verdicts: cassette.verdicts.filter((v: Verdict) => !staleVerdicts.has(v.key)),
      });
      dirty = false;
    },
  };
}
