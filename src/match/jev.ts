import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { hashOf } from "../normalize/canonical.js";
import { finalBody } from "../normalize/stream.js";
import type { RecordedRequest, RecordedResponse } from "../types.js";
import { requestDiff, textFields } from "./diff.js";

/** Pinned: the `jev-latest` alias moves, which would silently change verdicts. */
export const DEFAULT_JEV_MODEL = "jev-1.13.0";

/**
 * Bump whenever the question wording changes. Wording moves Jev's answers,
 * so it's part of every verdict key and old verdicts stop applying.
 */
export const QUESTION_VERSION = "v1";

/** Jev's state limit is 32k tokens; ~4 chars per token, with headroom for the questions. */
const MAX_STATE_CHARS = 100_000;

export const QUESTIONS = {
  still_valid: noul(
    "Would `recorded_response` be a correct and appropriate reply to `new_request`, given the changes in `diff`?",
    {
      true: "The changes do not alter what a correct reply must contain, its format, or which tools it calls; the recorded reply fully answers the new request.",
      false: "The changes ask for different facts, a different format, different tools or arguments, or add or remove a constraint the recorded reply violates.",
    },
  ),
  format_changed: noul("Does `diff` change the output format or structure that `new_request` requires?"),
  asks_different_task: noul("Is `new_request` asking for a different task than `old_request`?"),
};

export interface JudgeInput {
  old: RecordedRequest;
  next: RecordedRequest;
  response: RecordedResponse;
}

export interface Judgment {
  /** Probability the recorded response is still valid for the new request. */
  p: number;
  /** Diagnostic probabilities that explain a rejection. */
  signals: Record<string, number>;
  model: string;
  inputTokens: number;
}

export interface Judge {
  /** Identifies the model and question wording; part of every verdict key. */
  readonly id: string;
  judge(input: JudgeInput): Promise<Judgment>;
}

/** Key of the stored verdict for this (recording, new request, judge) triple. */
export function verdictKey(old: RecordedRequest, next: RecordedRequest, judgeId: string): string {
  return hashOf({ old, next, judge: judgeId, questions: QUESTIONS });
}

/** The recorded reply as Jev reads it: text plus tool calls. */
export function flattenResponse(provider: RecordedRequest["provider"], body: unknown): { text: string; tool_calls: unknown[] } {
  const b = (body ?? {}) as Record<string, any>;
  if (provider === "anthropic" && Array.isArray(b.content)) {
    return {
      text: b.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n"),
      tool_calls: b.content.filter((c: any) => c?.type === "tool_use").map((c: any) => ({ name: c.name, args: c.input })),
    };
  }
  const message = b.choices?.[0]?.message ?? {};
  return {
    text: typeof message.content === "string" ? message.content : "",
    tool_calls: (message.tool_calls ?? []).map((c: any) => ({ name: c.function?.name, args: c.function?.arguments })),
  };
}

/**
 * Builds Jev's state. Recorded prompts are full of instructions, so they only
 * ever appear inside named data fields. If the full requests don't fit, the
 * diff alone is sent; if even that doesn't fit, returns undefined.
 */
export function buildState(input: JudgeInput): Record<string, unknown> | undefined {
  const diff = requestDiff(input.old, input.next);
  const recorded_response = flattenResponse(input.next.provider, finalBody(input.next.provider, input.response));
  const full = { old_request: textFields(input.old), new_request: textFields(input.next), diff, recorded_response };
  if (JSON.stringify(full).length <= MAX_STATE_CHARS) return full;
  const slim = { diff, recorded_response };
  return JSON.stringify(slim).length <= MAX_STATE_CHARS ? slim : undefined;
}

export interface JevJudgeOptions {
  model?: string;
  /** Defaults to the `TYPESAFE_API_KEY` environment variable. */
  apiKey?: string;
  /** Passed to the Jev client, for tests. */
  fetch?: typeof fetch;
}

/** The default judge. The Jev client is created on first use, so replay mode never needs a key. */
export function createJevJudge(options: JevJudgeOptions = {}): Judge {
  const model = options.model ?? DEFAULT_JEV_MODEL;
  let client: TypeSafeClient | undefined;
  return {
    id: `${model}:${QUESTION_VERSION}`,
    async judge(input) {
      const state = buildState(input);
      if (!state) throw new Error("request too large for Jev to judge");
      client ??= new TypeSafeClient({
        defaultModel: model,
        timeout: 15_000,
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      const res = await client.systemOne({ state: state as never, questions: QUESTIONS, model });
      return {
        p: res.answers.still_valid.noul,
        signals: {
          format_changed: res.answers.format_changed.noul,
          asks_different_task: res.answers.asks_different_task.noul,
        },
        model: res.model,
        inputTokens: res.usage.input_tokens,
      };
    },
  };
}
