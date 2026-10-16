import { chatText, openai } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const LIMIT = "Keep answers under 60 words.";
const FOLLOW_UP = "And how much milk if I use oat milk instead?";

export default {
  id: "multi-turn",
  split: "tune",
  tags: ["multi-turn"],
  request: openai({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: `You are a helpful cooking assistant. ${LIMIT}` },
      { role: "user", content: "I'm making pancakes for 4 people. How much flour do I need?" },
      { role: "assistant", content: "About 250 g (2 cups) of plain flour makes pancakes for 4. Pair it with 2 eggs and about 300 ml of milk." },
      { role: "user", content: FOLLOW_UP },
    ],
  }),
  response: chatText("Use the same amount: about 300 ml of oat milk. It's a little thinner, so add a splash less if the batter looks runny."),
  edits: [
    {
      id: "reword-follow-up",
      category: "reword",
      replace: [[FOLLOW_UP, "What if I swap in oat milk, how much should I use?"]],
      draft: "replay",
      why: "Same follow-up question in other words.",
    },
    {
      id: "almond",
      category: "different-subject",
      replace: [["oat milk instead", "almond milk instead"]],
      draft: "rerecord",
      why: "The reply talks about oat milk.",
    },
    {
      id: "eight-people",
      category: "earlier-turn",
      replace: [["for 4 people", "for 8 people"]],
      draft: "rerecord",
      why: "For 8 people the milk should double; the reply says the same 300 ml.",
    },
    {
      id: "earlier-typo",
      category: "earlier-turn",
      replace: [["I'm making pancakes", "Im making pancakes"]],
      draft: "replay",
      why: "Typo in an earlier turn; nothing the reply depends on.",
    },
    {
      id: "limit-15",
      category: "changed-requirement",
      replace: [[LIMIT, "Keep answers under 15 words."]],
      draft: "rerecord",
      why: "The reply is 24 words.",
    },
    {
      id: "limit-30",
      category: "changed-requirement",
      replace: [[LIMIT, "Keep answers under 30 words."]],
      draft: "replay",
      why: "The reply is 24 words, under the new limit.",
    },
    {
      id: "earlier-400ml",
      category: "earlier-turn",
      replace: [["about 300 ml of milk", "about 400 ml of milk"]],
      draft: "rerecord",
      why: "'The same amount' is now 400 ml; the reply says 300 ml.",
    },
    {
      id: "vegan",
      category: "audience",
      replace: [[LIMIT, `${LIMIT} The user is vegan.`]],
      draft: "replay",
      why: "The reply only recommends oat milk, which is vegan; the eggs are in an earlier turn the reply doesn't depend on (rule 7).",
    },
    {
      id: "metric-only",
      category: "added-met",
      replace: [[LIMIT, `${LIMIT} Use metric units only.`]],
      draft: "replay",
      why: "The reply already uses millilitres.",
    },
    {
      id: "sign-off",
      category: "added-broken",
      replace: [[LIMIT, `${LIMIT} End every answer with "Happy cooking!"`]],
      draft: "rerecord",
      why: "The reply has no sign-off.",
    },
  ],
} satisfies Family;
