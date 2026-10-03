import type { Provider } from "../types.js";

/**
 * Body fields holding the conversation text that Jev may judge. Every other
 * field (model, sampling params, response format, tool_choice, stream, …)
 * must match exactly before a recording is eligible for judgment.
 */
export const TEXT_FIELDS: Record<Provider, readonly string[]> = {
  openai: ["messages", "tools"],
  "openai-responses": ["input", "instructions", "tools"],
  anthropic: ["messages", "system", "tools"],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

/** Tool name → its argument schema, from the request's `tools`. */
export function toolSchemas(provider: Provider, body: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const tools = isObj(body) && Array.isArray(body.tools) ? body.tools : [];
  for (const t of tools) {
    if (!isObj(t)) continue;
    if (provider === "anthropic" && typeof t.name === "string") out.set(t.name, t.input_schema);
    if (provider === "openai" && isObj(t.function) && typeof t.function.name === "string") {
      out.set(t.function.name, t.function.parameters);
    }
    // Responses API function tools are flat; built-in tools (web_search, …) have no name.
    if (provider === "openai-responses" && t.type === "function" && typeof t.name === "string") {
      out.set(t.name, t.parameters);
    }
  }
  return out;
}

/** Names of the tools a recorded response called, or undefined if the body can't be read (e.g. a raw stream). */
export function calledTools(provider: Provider, body: unknown): string[] | undefined {
  if (!isObj(body)) return undefined;
  if (provider === "anthropic") {
    if (!Array.isArray(body.content)) return undefined;
    return body.content.flatMap((c) => (isObj(c) && c.type === "tool_use" && typeof c.name === "string" ? [c.name] : []));
  }
  if (provider === "openai-responses") {
    if (!Array.isArray(body.output)) return undefined;
    return body.output.flatMap((o) => (isObj(o) && o.type === "function_call" && typeof o.name === "string" ? [o.name] : []));
  }
  if (!Array.isArray(body.choices)) return undefined;
  return body.choices.flatMap((choice) => {
    const calls = isObj(choice) && isObj(choice.message) && Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [];
    return calls.flatMap((c) => (isObj(c) && isObj(c.function) && typeof c.function.name === "string" ? [c.function.name] : []));
  });
}

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text", "tool_use", "tool_result", "thinking"]);

/** Every non-text message part (images, audio, files), in order. Jev reads text only. */
export function mediaParts(body: unknown): unknown[] {
  const list = isObj(body) ? (Array.isArray(body.messages) ? body.messages : body.input) : undefined;
  const messages = Array.isArray(list) ? list : [];
  return messages.flatMap((m) => {
    const content = isObj(m) && Array.isArray(m.content) ? m.content : [];
    return content.filter((part) => isObj(part) && typeof part.type === "string" && !TEXT_PART_TYPES.has(part.type));
  });
}
