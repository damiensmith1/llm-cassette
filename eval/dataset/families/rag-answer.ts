import { anthropic, anthropicText } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const REFUNDS = "[1] Refunds (updated January 2026): Customers can get a full refund within 30 days of purchase. After 30 days, refunds are given as store credit.";
const SHIPPING = "Shipping: Orders ship within 2 business days. Express shipping is available in the US and Canada.";
const WARRANTY = "Warranty: Hardware is covered for 12 months against manufacturing defects.";
const CITE = "Cite each document you use as [1], [2] and so on. ";

const SYSTEM = `Answer the customer's question using only the documents below. ${CITE}If the documents don't answer the question, say you don't know.

<documents>
${REFUNDS}
[2] ${SHIPPING}
[3] ${WARRANTY}
</documents>`;

const QUESTION = "Can I get my money back 6 weeks after buying?";

export default {
  id: "rag-answer",
  split: "test",
  tags: [],
  request: anthropic({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: "user", content: QUESTION }],
  }),
  response: anthropicText("Not as cash. Full refunds are only available within 30 days of purchase; after that, you'd get store credit instead [1]."),
  edits: [
    {
      id: "reword-question",
      category: "reword",
      replace: [[QUESTION, "If I bought something six weeks ago, can I still get a refund?"]],
      draft: "replay",
      why: "Same question in other words.",
    },
    {
      id: "three-weeks",
      category: "different-subject",
      replace: [["6 weeks", "3 weeks"]],
      draft: "rerecord",
      why: "Three weeks is inside the 30-day window, so the answer is now yes.",
    },
    {
      id: "sixty-days",
      category: "input-edit",
      replace: [["within 30 days of purchase. After 30 days", "within 60 days of purchase. After 60 days"]],
      draft: "rerecord",
      why: "Six weeks is now inside the refund window; the reply says no.",
    },
    {
      id: "swap-2-3",
      category: "input-edit",
      replace: [[`[2] ${SHIPPING}\n[3] ${WARRANTY}`, `[2] ${WARRANTY}\n[3] ${SHIPPING}`]],
      draft: "replay",
      why: "The refund policy is still [1].",
    },
    {
      id: "extra-doc",
      category: "irrelevant-addition",
      replace: [[`${WARRANTY}\n</documents>`, `${WARRANTY}\n[4] Gift cards: Gift cards never expire.\n</documents>`]],
      draft: "replay",
      why: "The new document isn't relevant to the question.",
    },
    {
      id: "refunds-renumbered",
      category: "input-edit",
      replace: [
        [
          `${REFUNDS}\n[2] ${SHIPPING}\n[3] ${WARRANTY}`,
          `[1] ${WARRANTY}\n[2] ${SHIPPING}\n${REFUNDS.replace("[1]", "[3]")}`,
        ],
      ],
      draft: "rerecord",
      why: "The refund policy is now [3], so the reply's [1] cites the warranty.",
    },
    {
      id: "cite-by-title",
      category: "changed-requirement",
      replace: [[CITE, "Cite each document you use by its title in parentheses. "]],
      draft: "rerecord",
      why: "The reply cites [1], not the title.",
    },
    {
      id: "no-citations",
      category: "removed-requirement",
      replace: [[CITE, ""]],
      draft: "replay",
      why: "Citations are no longer required, but the one in the reply is still correct.",
    },
    {
      id: "refunds-removed",
      category: "input-edit",
      replace: [[`${REFUNDS}\n`, ""]],
      draft: "rerecord",
      why: "Without the refund policy the right answer is that it doesn't know.",
    },
    {
      id: "policy-date",
      category: "input-edit",
      replace: [["(updated January 2026)", "(updated March 2026)"]],
      draft: "replay",
      why: "The policy itself is unchanged.",
    },
    {
      id: "one-sentence",
      category: "added-broken",
      replace: [["say you don't know.", "say you don't know. Answer in one sentence."]],
      draft: "rerecord",
      why: "The reply is two sentences.",
    },
  ],
} satisfies Family;
