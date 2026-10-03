import type { Provider, RecordedResponse, SseEvent } from "../types.js";

type Obj = Record<string, any>;

export function isEventStream(contentType: string | undefined): boolean {
  return contentType?.includes("text/event-stream") ?? false;
}

/** Parses an SSE body into events. `data` is parsed as JSON when it is JSON; comments are dropped. */
export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event: string | undefined;
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "id") id = value;
      else if (field === "data") data.push(value);
    }
    if (event === undefined && data.length === 0) continue;
    const raw = data.join("\n");
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Not JSON, e.g. OpenAI's "[DONE]".
    }
    events.push({ ...(event !== undefined ? { event } : {}), ...(id !== undefined ? { id } : {}), data: parsed });
  }
  return events;
}

/** Serializes events back to SSE, one string per event. */
export function serializeSse(events: readonly SseEvent[]): string[] {
  return events.map((e) => {
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    const lines = [
      ...(e.event !== undefined ? [`event: ${e.event}`] : []),
      ...(e.id !== undefined ? [`id: ${e.id}`] : []),
      ...data.split("\n").map((l) => `data: ${l}`),
    ];
    return lines.join("\n") + "\n\n";
  });
}

/** A stream that emits one SSE event per chunk, like the real API. */
export function sseStream(events: readonly SseEvent[]): ReadableStream<Uint8Array> {
  const chunks = serializeSse(events);
  const encoder = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      const next = chunks.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
  });
}

function assembleOpenAI(events: readonly SseEvent[]): Obj | undefined {
  const choices: Obj[] = [];
  let seen = false;
  for (const { data } of events) {
    const chunk = data as Obj;
    if (!Array.isArray(chunk?.choices)) continue;
    seen = true;
    for (const c of chunk.choices) {
      const choice = (choices[c.index ?? 0] ??= { index: c.index ?? 0, message: { role: "assistant", content: "" } });
      const delta = c.delta ?? {};
      if (typeof delta.content === "string") choice.message.content += delta.content;
      for (const tc of delta.tool_calls ?? []) {
        const calls: Obj[] = (choice.message.tool_calls ??= []);
        const call = (calls[tc.index ?? 0] ??= { id: tc.id, type: "function", function: { name: "", arguments: "" } });
        if (tc.function?.name) call.function.name += tc.function.name;
        if (tc.function?.arguments) call.function.arguments += tc.function.arguments;
      }
      if (c.finish_reason) choice.finish_reason = c.finish_reason;
    }
  }
  return seen ? { choices } : undefined;
}

function assembleAnthropic(events: readonly SseEvent[]): Obj | undefined {
  let message: Obj | undefined;
  const partialJson: string[] = [];
  for (const { data } of events) {
    const e = data as Obj;
    if (e?.type === "message_start") message = { ...e.message, content: [] };
    else if (!message) continue;
    else if (e.type === "content_block_start") {
      message.content[e.index] = { ...e.content_block };
      partialJson[e.index] = "";
    } else if (e.type === "content_block_delta") {
      const block = message.content[e.index];
      if (!block) continue;
      if (e.delta?.type === "text_delta") block.text = (block.text ?? "") + e.delta.text;
      if (e.delta?.type === "thinking_delta") block.thinking = (block.thinking ?? "") + e.delta.thinking;
      if (e.delta?.type === "input_json_delta") partialJson[e.index] += e.delta.partial_json;
    } else if (e.type === "content_block_stop") {
      const block = message.content[e.index];
      if (block?.type === "tool_use" && partialJson[e.index]) {
        try {
          block.input = JSON.parse(partialJson[e.index]!);
        } catch {
          // Leave the start-event input if the JSON never completed.
        }
      }
    } else if (e.type === "message_delta") Object.assign(message, e.delta);
  }
  return message;
}

/**
 * The response body as a non-streamed call would have returned it. Streamed
 * recordings are reassembled so hard checks and the judge can read them;
 * undefined if the stream can't be read.
 */
export function finalBody(provider: Provider, response: RecordedResponse): unknown {
  if (!response.events) return response.body;
  return provider === "anthropic" ? assembleAnthropic(response.events) : assembleOpenAI(response.events);
}
