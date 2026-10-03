import { finalBody } from "../normalize/stream.js";
import type { Provider, RecordedRequest } from "../types.js";
import { requestDiff } from "./diff.js";
import type { Change } from "./diff.js";
import { flattenResponse, QUESTION_VERSION } from "./jev.js";
import type { Judge, JudgeInput } from "./jev.js";

export const DEFAULT_SPAN_MODEL = "span-01-pro";
const SCORES_URL = "https://api.respan.ai/api/v1/scores";

/**
 * span-01 is a behavior detector: it reliably spots a failure that's
 * present, but asked "is this reply correct?" about a long structured
 * reply it said no even to the unedited request. So it's told exactly what
 * changed (a note after the conversation) and asked whether the reply
 * *breaks* that change; p(valid) = p_absent. The diagnostics are
 * failure-framed too. The note quotes whole sentences: with a fixed
 * window of characters around the edit it misjudged harmless rewordings. Bump QUESTION_VERSION (shared with Jev) when the
 * wording changes. Field-tested 2026-10-03, see docs/design.md.
 */
export const BEHAVIORS = [
  {
    id: "breaks_change",
    definition:
      "The assistant's reply contradicts or ignores the changed instruction: given the instruction as it is now, the reply would be wrong, incomplete, or in the wrong form.",
  },
  {
    id: "format_mismatch",
    definition: "The assistant's reply does not follow the output format or structure that the conversation asks for.",
  },
  {
    id: "off_task",
    definition: "The assistant's reply answers a different question or does a different task than the latest request asks for.",
  },
] as const;

const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** The note appended after the conversation, so span-01 sees what changed. */
export function changeNote(changes: readonly Change[]): SpanMessage {
  const lines = changes.map((c) => `In ${c.path}:\nBefore: ${text(c.before)}\nNow: ${text(c.after)}`);
  return {
    role: "system",
    content: `This instruction changed after the reply below was written.\n${lines.join("\n\n")}`,
  };
}

interface SpanMessage {
  role: string;
  content: string;
}

type Obj = Record<string, any>;

/** Text of a content value that is either a string or an array of parts/blocks. */
function partsText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p: Obj) => {
      if (typeof p === "string") return p;
      if (p?.type === "text" || p?.type === "input_text" || p?.type === "output_text") return p.text ?? "";
      if (p?.type === "tool_use") return `[tool call ${p.name}(${JSON.stringify(p.input ?? {})})]`;
      if (p?.type === "tool_result") return `[tool result: ${partsText(p.content)}]`;
      return `[${p?.type ?? "part"}]`;
    })
    .join("\n");
}

/** The request as a plain conversation: span-01 reads text messages only. */
export function toSpanInput(provider: Provider, body: unknown): SpanMessage[] {
  const b = (body ?? {}) as Obj;
  const out: SpanMessage[] = [];
  if (provider === "anthropic" && b.system) out.push({ role: "system", content: partsText(b.system) });
  if (provider === "openai-responses" && b.instructions) out.push({ role: "system", content: partsText(b.instructions) });
  const tools: Obj[] = Array.isArray(b.tools) ? b.tools : [];
  if (tools.length > 0) {
    const list = tools
      .map((t) => (provider === "openai" ? t.function ?? {} : t))
      .filter((t: Obj) => t.name)
      .map((t: Obj) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`)
      .join("\n");
    out.push({ role: "system", content: `Available tools:\n${list}` });
  }
  if (provider === "openai-responses") {
    const input = typeof b.input === "string" ? [{ role: "user", content: b.input }] : Array.isArray(b.input) ? b.input : [];
    for (const item of input as Obj[]) {
      if (item?.type === "function_call") out.push({ role: "assistant", content: `[tool call ${item.name}(${item.arguments ?? ""})]` });
      else if (item?.type === "function_call_output") out.push({ role: "tool", content: `[tool result: ${partsText(item.output)}]` });
      else if (item?.role) out.push({ role: String(item.role), content: partsText(item.content).trim() });
    }
    return out;
  }
  for (const m of Array.isArray(b.messages) ? b.messages : []) {
    let content = partsText(m?.content);
    for (const c of m?.tool_calls ?? []) content += `\n[tool call ${c.function?.name}(${c.function?.arguments ?? ""})]`;
    out.push({ role: String(m?.role ?? "user"), content: content.trim() });
  }
  return out;
}

export interface SpanJudgeOptions {
  /** `span-01-pro` (default) or `span-01-free` (daily cap). */
  model?: string;
  /** Replay threshold for this judge (0–1), used when the session sets none. */
  threshold?: number;
  /** Defaults to the `RESPAN_API_KEY` environment variable. */
  apiKey?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

/** A judge backed by Respan's span-01 classifier. Only called in record/refresh mode. */
export function createSpanJudge(options: SpanJudgeOptions = {}): Judge {
  const model = options.model ?? DEFAULT_SPAN_MODEL;
  const doFetch = options.fetch ?? globalThis.fetch;
  return {
    id: `${model}:${QUESTION_VERSION}`,
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
    setupProblem: () => (options.apiKey ?? process.env.RESPAN_API_KEY ? undefined : "RESPAN_API_KEY is not set"),
    async judge(input: JudgeInput) {
      const apiKey = options.apiKey ?? process.env.RESPAN_API_KEY;
      if (!apiKey) throw new Error("RESPAN_API_KEY is not set");
      const { provider } = input.next;
      const reply = flattenResponse(provider, finalBody(provider, input.response));
      const calls = reply.tool_calls.map((c: any) => `[tool call ${c.name}(${typeof c.args === "string" ? c.args : JSON.stringify(c.args)})]`);
      const res = await doFetch(SCORES_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          span: {
            input: [...toSpanInput(provider, (input.next as RecordedRequest).body), changeNote(requestDiff(input.old, input.next, "sentence"))],
            output: { role: "assistant", content: [reply.text, ...calls].filter(Boolean).join("\n") },
          },
          behaviors: BEHAVIORS,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`span-01 returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        model: string;
        results: { id: string; p_present: number; p_absent: number }[];
        usage?: { input_tokens: number };
      };
      const result = (id: string) => data.results.find((r) => r.id === id);
      const p = (id: string) => result(id)?.p_present;
      const breaks = result("breaks_change");
      if (!breaks) throw new Error("span-01 returned no breaks_change score");
      return {
        // Not "present", and not "can't tell" either: p_not_observable counts against replay.
        p: breaks.p_absent,
        signals: { format_mismatch: p("format_mismatch") ?? 0, off_task: p("off_task") ?? 0 },
        model: data.model,
        inputTokens: data.usage?.input_tokens ?? 0,
      };
    },
  };
}
