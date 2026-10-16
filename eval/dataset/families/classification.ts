import { chatText, openai } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const LABELS = "positive, negative, or mixed";
const SYSTEM = `Classify the sentiment of the product review as ${LABELS}. Reply with the label only.`;
const REVIEW = "Battery life is excellent and it charges fast, but the case scratches far too easily.";

export default {
  id: "classification",
  split: "test",
  tags: [],
  request: openai({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: REVIEW },
    ],
  }),
  response: chatText("mixed"),
  edits: [
    {
      id: "labels-renamed",
      category: "changed-requirement",
      replace: [[LABELS, "POS, NEG, or MIX"]],
      draft: "rerecord",
      why: "The reply says mixed, which is no longer a label.",
    },
    {
      id: "add-neutral",
      category: "changed-requirement",
      replace: [[LABELS, "positive, negative, neutral, or mixed"]],
      draft: "replay",
      why: "The review is still mixed, and mixed is still a label.",
    },
    {
      id: "now-positive",
      category: "input-edit",
      replace: [[", but the case scratches far too easily.", ", and the case feels solid."]],
      draft: "rerecord",
      why: "The review is now positive.",
    },
    {
      id: "typo",
      category: "cosmetic",
      replace: [["excellent", "excelent"]],
      draft: "replay",
      why: "Typo only.",
    },
    {
      id: "drop-mixed",
      category: "changed-requirement",
      replace: [[LABELS, "positive or negative"]],
      draft: "rerecord",
      why: "Mixed is no longer allowed.",
    },
    {
      id: "json",
      category: "changed-requirement",
      replace: [["Reply with the label only.", 'Reply with JSON like {"label": "positive"}.']],
      draft: "rerecord",
      why: "The reply is a bare label, not JSON.",
    },
    {
      id: "reword",
      category: "reword",
      replace: [[SYSTEM, `Label the review's sentiment: ${LABELS}. Output only the label.`]],
      draft: "replay",
      why: "Same instruction in other words.",
    },
    {
      id: "uppercase",
      category: "added-broken",
      replace: [["Reply with the label only.", "Reply with the label only, in uppercase."]],
      draft: "rerecord",
      why: "The reply is lowercase.",
    },
    {
      id: "confidence",
      category: "added-broken",
      replace: [["Reply with the label only.", "Reply with the label and a confidence from 0 to 1."]],
      draft: "rerecord",
      why: "The reply has no confidence.",
    },
    {
      id: "other-mixed-review",
      category: "input-edit",
      replace: [[REVIEW, "Great screen, but the speakers are terrible."]],
      draft: "replay",
      why: "A different review, but still mixed.",
    },
    {
      id: "reviewer-name",
      category: "irrelevant-addition",
      replace: [[REVIEW, `Review by Sam K.: ${REVIEW}`]],
      draft: "replay",
      why: "The reviewer's name doesn't change the sentiment.",
    },
  ],
} satisfies Family;
