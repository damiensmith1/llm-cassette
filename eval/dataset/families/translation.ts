import { responses, responsesText } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const ONLY = "Reply with the translation only.";

export default {
  id: "translation",
  split: "tune",
  tags: [],
  request: responses({
    model: "gpt-5-mini",
    instructions: `Translate the user's text into French. ${ONLY}`,
    input: "The meeting has been moved to Thursday at 3 pm.",
  }),
  response: responsesText("La réunion a été déplacée à jeudi à 15 h."),
  edits: [
    {
      id: "spanish",
      category: "different-subject",
      replace: [["into French", "into Spanish"]],
      draft: "rerecord",
      why: "The reply is in French.",
    },
    {
      id: "friday",
      category: "input-edit",
      replace: [["Thursday", "Friday"]],
      draft: "rerecord",
      why: "The reply says jeudi.",
    },
    {
      id: "formal",
      category: "added-met",
      replace: [[ONLY, `Use a formal register. ${ONLY}`]],
      draft: "replay",
      why: "The translation is already neutral and formal.",
    },
    {
      id: "informal-tu",
      category: "added-met",
      replace: [[ONLY, `Address the reader as tu. ${ONLY}`]],
      draft: "replay",
      why: "Nothing in the sentence addresses the reader, so tu vs vous doesn't arise.",
    },
    {
      id: "pm-spacing",
      category: "cosmetic",
      replace: [["3 pm.", "3pm."]],
      draft: "replay",
      why: "Spacing only.",
    },
    {
      id: "canadian",
      category: "audience",
      replace: [["into French", "into Canadian French"]],
      draft: "replay",
      why: "The sentence reads the same in Canadian French; 15 h is standard there too.",
    },
    {
      id: "include-original",
      category: "changed-requirement",
      replace: [[ONLY, "Reply with the original text, then the translation."]],
      draft: "rerecord",
      why: "The reply has only the translation.",
    },
    {
      id: "am",
      category: "input-edit",
      replace: [["3 pm", "3 am"]],
      draft: "rerecord",
      why: "The reply says 15 h.",
    },
    {
      id: "reword",
      category: "reword",
      replace: [["Translate the user's text into French.", "Render the user's text in French."]],
      draft: "replay",
      why: "Same instruction in other words.",
    },
    {
      id: "explain-choices",
      category: "added-broken",
      replace: [[ONLY, "Reply with the translation, then explain any word choices in English."]],
      draft: "rerecord",
      why: "The reply has no explanation.",
    },
    {
      id: "extra-sentence",
      category: "input-edit",
      replace: [["at 3 pm.", "at 3 pm. Please bring the Q3 report."]],
      draft: "rerecord",
      why: "The reply doesn't translate the new sentence.",
    },
  ],
} satisfies Family;
