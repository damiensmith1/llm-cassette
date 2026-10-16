import type { RecordedRequest, RecordedResponse } from "../../src/types.js";

/** The answer key's verdict on a pair. See docs/labelling.md. */
export type Label = "replay" | "rerecord" | "unsure";

/** Families are split whole, so no base prompt is in both. See docs/evals.md. */
export type Split = "tune" | "test";

/** Conditions that make judging harder, for slicing results. */
export type Tag = "long-prompt" | "structured" | "tools" | "multi-turn";

/** Kinds of edit. Labels vary within a kind; the report breaks results down by it. */
export type Category =
  | "reword"
  | "cosmetic"
  | "added-met"
  | "added-broken"
  | "changed-requirement"
  | "removed-requirement"
  | "different-subject"
  | "input-edit"
  | "irrelevant-addition"
  | "tools"
  | "earlier-turn"
  | "audience"
  | "settings";

export interface Edit {
  /** Unique within its family. */
  id: string;
  category: Category;
  /** Substitutions in the request's conversation text. Each `from` must occur exactly once. */
  replace?: [from: string, to: string][];
  /** Any other change (tools, settings), applied to a copy of the body. */
  patch?: (body: Record<string, any>) => void;
  /** The LLM-drafted label, reviewed by a human with `npm run eval:review`. */
  draft: Label;
  /** One sentence on why, shown while reviewing. */
  why: string;
}

/** A recording (request + the reply it got) and the edits made to it. */
export interface Family {
  id: string;
  split: Split;
  tags: Tag[];
  request: RecordedRequest;
  response: RecordedResponse;
  edits: Edit[];
}
