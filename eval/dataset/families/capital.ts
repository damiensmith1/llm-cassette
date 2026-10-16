import { chatText, openai } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const QUESTION = "What is the capital of France?";
const SYSTEM = "Answer in one word.";

export default {
  id: "capital",
  split: "tune",
  tags: [],
  request: openai({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: QUESTION },
    ],
  }),
  response: chatText("Paris"),
  edits: [
    {
      id: "lowercase-question",
      category: "cosmetic",
      replace: [[QUESTION, "what is the capital of france"]],
      draft: "replay",
      why: "Same question with different casing and punctuation.",
    },
    {
      id: "paraphrase",
      category: "reword",
      replace: [[QUESTION, "Which city is France's capital?"]],
      draft: "replay",
      why: "Same question in other words.",
    },
    {
      id: "be-concise",
      category: "added-met",
      replace: [[SYSTEM, "Answer in one word. Be concise."]],
      draft: "replay",
      why: "A one-word reply is already concise.",
    },
    {
      id: "lowercase-answer",
      category: "added-broken",
      replace: [[SYSTEM, "Answer in one word, in lowercase."]],
      draft: "rerecord",
      why: "The reply is capitalised; the new request wants lowercase.",
    },
    {
      id: "germany",
      category: "different-subject",
      replace: [["France?", "Germany?"]],
      draft: "rerecord",
      why: "Asks about Germany; the reply names France's capital.",
    },
    {
      id: "in-1940",
      category: "different-subject",
      replace: [[QUESTION, "What was the capital of France in 1940?"]],
      draft: "unsure",
      why: "Contested: the government sat in Vichy from mid-1940, so whether Paris is the answer depends on interpretation.",
    },
    {
      id: "explain-why",
      category: "changed-requirement",
      replace: [[QUESTION, "What is the capital of France? Explain why."]],
      draft: "unsure",
      why: "Conflicting instructions: the system prompt still says one word, the user now asks for a reason.",
    },
    {
      id: "tutor-persona",
      category: "irrelevant-addition",
      replace: [[SYSTEM, "You are a geography tutor. Answer in one word."]],
      draft: "replay",
      why: "The persona doesn't change what the one-word answer must be.",
    },
    {
      id: "full-sentence",
      category: "changed-requirement",
      replace: [[SYSTEM, "Answer in a full sentence."]],
      draft: "rerecord",
      why: "A bare word isn't a full sentence.",
    },
    {
      id: "in-french",
      category: "added-met",
      replace: [[SYSTEM, "Answer in one word, in French."]],
      draft: "replay",
      why: "Paris is also the French name, so the reply already meets it.",
    },
    {
      id: "drop-one-word",
      category: "removed-requirement",
      replace: [[SYSTEM, "Answer the question."]],
      draft: "replay",
      why: "Without the one-word rule, Paris is still a correct and appropriate answer.",
    },
    {
      id: "temperature",
      category: "settings",
      patch: (body) => {
        body.temperature = 0.2;
      },
      draft: "replay",
      why: "Sampling temperature doesn't change what a correct reply is; the hard checks re-record it anyway.",
    },
  ],
} satisfies Family;
