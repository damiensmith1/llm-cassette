import { anthropic, anthropicText } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const SYSTEM = "You are a senior TypeScript engineer. Reply with a single code block and no explanation.";
const ASK = "Write a function `sum(nums: number[]): number` that returns the sum of the array. Return 0 for an empty array.";
const EMPTY = "Return 0 for an empty array.";

export default {
  id: "code-gen",
  split: "tune",
  tags: [],
  request: anthropic({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: ASK }],
  }),
  response: anthropicText("```ts\nexport function sum(nums: number[]): number {\n  return nums.reduce((total, n) => total + n, 0);\n}\n```"),
  edits: [
    {
      id: "reword",
      category: "reword",
      replace: [[ASK, "Implement `sum(nums: number[]): number`: return the total of the array, or 0 when it's empty."]],
      draft: "replay",
      why: "Same function, same behaviour.",
    },
    {
      id: "python",
      category: "different-subject",
      replace: [["Write a function `sum(nums: number[]): number` that", "Write a Python function `total(nums: list[float]) -> float` that"]],
      draft: "rerecord",
      why: "Asks for Python with a different signature.",
    },
    {
      id: "jsdoc",
      category: "added-broken",
      replace: [[EMPTY, `${EMPTY} Include a JSDoc comment.`]],
      draft: "rerecord",
      why: "The code has no JSDoc comment.",
    },
    {
      id: "no-reduce",
      category: "added-broken",
      replace: [[EMPTY, `${EMPTY} Don't use reduce.`]],
      draft: "rerecord",
      why: "The code uses reduce.",
    },
    {
      id: "prefer-reduce",
      category: "added-met",
      replace: [[EMPTY, `${EMPTY} Prefer reduce over a loop.`]],
      draft: "replay",
      why: "The code already uses reduce.",
    },
    {
      id: "with-explanation",
      category: "changed-requirement",
      replace: [["Reply with a single code block and no explanation.", "Reply with a code block followed by a one-line explanation."]],
      draft: "rerecord",
      why: "The reply has no explanation.",
    },
    {
      id: "throw-on-empty",
      category: "changed-requirement",
      replace: [[EMPTY, "Throw a RangeError for an empty array."]],
      draft: "rerecord",
      why: "The code returns 0 for an empty array instead of throwing.",
    },
    {
      id: "casing",
      category: "cosmetic",
      replace: [["senior TypeScript engineer", "senior Typescript engineer"]],
      draft: "replay",
      why: "Casing only.",
    },
    {
      id: "named-export",
      category: "added-met",
      replace: [[EMPTY, `${EMPTY} Use a named export.`]],
      draft: "replay",
      why: "It's already a named export.",
    },
    {
      id: "default-export",
      category: "added-broken",
      replace: [[EMPTY, `${EMPTY} Use a default export.`]],
      draft: "rerecord",
      why: "It's a named export, not a default one.",
    },
    {
      id: "skip-nan",
      category: "added-broken",
      replace: [[EMPTY, `Skip NaN values. ${EMPTY}`]],
      draft: "rerecord",
      why: "The code adds NaN like any other number.",
    },
    {
      id: "model-change",
      category: "settings",
      patch: (body) => {
        body.model = "claude-opus-5-5";
      },
      draft: "replay",
      why: "The recorded code is still a correct reply; the hard checks re-record a model change anyway.",
    },
  ],
} satisfies Family;
