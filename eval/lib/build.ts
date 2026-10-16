import type { RecordedRequest, RecordedResponse } from "../../src/types.js";

const request = (provider: RecordedRequest["provider"], url: string) => (body: Record<string, unknown>): RecordedRequest => ({
  provider,
  method: "POST",
  url,
  body,
});

export const openai = request("openai", "https://api.openai.com/v1/chat/completions");
export const responses = request("openai-responses", "https://api.openai.com/v1/responses");
export const anthropic = request("anthropic", "https://api.anthropic.com/v1/messages");

const reply = (body: unknown): RecordedResponse => ({ status: 200, headers: {}, body, events: null });

export const chatText = (content: string) =>
  reply({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });

export const chatToolCall = (name: string, args: Record<string, unknown>) =>
  reply({
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
        },
        finish_reason: "tool_calls",
      },
    ],
  });

export const responsesText = (text: string) =>
  reply({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] });

export const anthropicContent = (content: Record<string, unknown>[]) =>
  reply({
    type: "message",
    role: "assistant",
    content,
    stop_reason: content.some((c) => c.type === "tool_use") ? "tool_use" : "end_turn",
  });

export const anthropicText = (text: string) => anthropicContent([{ type: "text", text }]);

/** An OpenAI Chat Completions function tool. */
export const chatTool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

/** An Anthropic tool. */
export const anthropicTool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  name,
  description,
  input_schema: { type: "object", properties, required },
});
