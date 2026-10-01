/** How a test run treats cassettes. See docs/design.md. */
export type Mode = "replay" | "record" | "refresh";

export type Provider = "openai" | "anthropic";

export interface RecordedRequest {
  provider: Provider;
  url: string;
  method: string;
  /** Canonical (sorted-key) JSON body with secrets redacted. */
  body: unknown;
}

export interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /** Parsed SSE events for streamed responses (post-MVP). */
  events: null;
}

export interface Interaction {
  request: RecordedRequest;
  response: RecordedResponse;
  recordedAt: string;
}

/** A stored Jev judgment, so replay never calls Jev. */
export interface Verdict {
  key: string;
  /** The model version that answered, as reported by the judge. */
  model: string;
  /** The judge's id (model + question version) at the time. */
  judge: string;
  p: number;
  signals: Record<string, number>;
  threshold: number;
  replay: boolean;
}

export interface Cassette {
  version: 1;
  interactions: Interaction[];
  verdicts: Verdict[];
}

/** Which rung of the matching ladder produced the result. */
export type MatchKind = "exact" | "scrubbed" | "judged" | "rejected" | "miss";
