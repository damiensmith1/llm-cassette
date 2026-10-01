import { vi } from "vitest";

export const chatReply = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1,
  model: "gpt-test",
  choices: [{ index: 0, message: { role: "assistant", content: "receipts" }, finish_reason: "stop" }],
};

/** A stand-in for the network that counts calls. */
export function fakeNetwork(reply: unknown) {
  return vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(reply), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": "secret=1" },
    }),
  );
}
