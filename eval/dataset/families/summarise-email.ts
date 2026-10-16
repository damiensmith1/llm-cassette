import { responses, responsesText } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const INSTRUCTIONS = "Summarise the email in one sentence for a busy manager. Lead with any decision or action needed.";
const LEAD = "Lead with any decision or action needed.";

const EMAIL = `Hi team,

Quick update on the Atlas migration. We finished moving the billing service last night with no downtime. The reporting service is next: it needs a two-hour read-only window, and I'd like to schedule it for Saturday 9–11am. Please reply by Thursday if that clashes with anything.

Thanks,
Priya
Platform Team | Ext. 4412`;

export default {
  id: "summarise-email",
  split: "test",
  tags: [],
  request: responses({ model: "gpt-5-mini", instructions: INSTRUCTIONS, input: EMAIL }),
  response: responsesText(
    "Priya needs any objections by Thursday to a two-hour read-only window on Saturday 9–11am for migrating the reporting service, after billing moved last night with no downtime.",
  ),
  edits: [
    {
      id: "reword-instructions",
      category: "reword",
      replace: [[INSTRUCTIONS, "Give a one-sentence summary of the email for a busy manager, leading with any decision or action needed."]],
      draft: "replay",
      why: "Same instruction in other words.",
    },
    {
      id: "two-sentences",
      category: "changed-requirement",
      replace: [["in one sentence", "in two sentences"]],
      draft: "rerecord",
      why: "The reply is one sentence.",
    },
    {
      id: "bullets",
      category: "changed-requirement",
      replace: [["in one sentence", "as three bullet points"]],
      draft: "rerecord",
      why: "The reply is a sentence, not bullets.",
    },
    {
      id: "signature",
      category: "input-edit",
      replace: [["Ext. 4412", "Ext. 4415"]],
      draft: "replay",
      why: "The summary doesn't mention the extension.",
    },
    {
      id: "sunday",
      category: "input-edit",
      replace: [["Saturday 9–11am", "Sunday 9–11am"]],
      draft: "rerecord",
      why: "The reply says Saturday.",
    },
    {
      id: "wednesday",
      category: "input-edit",
      replace: [["reply by Thursday", "reply by Wednesday"]],
      draft: "rerecord",
      why: "The reply says Thursday.",
    },
    {
      id: "greeting",
      category: "cosmetic",
      replace: [["Hi team,", "Hello all,"]],
      draft: "replay",
      why: "The greeting doesn't affect the summary.",
    },
    {
      id: "on-call-engineer",
      category: "audience",
      replace: [["for a busy manager", "for an on-call engineer"]],
      draft: "replay",
      why: "The window and the deadline suit an engineer as well as a manager.",
    },
    {
      id: "office-closed",
      category: "input-edit",
      replace: [
        [
          "Please reply by Thursday if that clashes with anything.",
          "Please reply by Thursday if that clashes with anything. Also, the office is closed on Monday for the holiday.",
        ],
      ],
      draft: "unsure",
      why: "Whether a one-sentence summary must mention the office closure is a judgement call.",
    },
    {
      id: "no-names",
      category: "added-broken",
      replace: [[LEAD, `${LEAD} Don't mention people by name.`]],
      draft: "rerecord",
      why: "The reply names Priya.",
    },
    {
      id: "some-downtime",
      category: "input-edit",
      replace: [["with no downtime", "with about 20 minutes of downtime"]],
      draft: "rerecord",
      why: "The reply says no downtime.",
    },
    {
      id: "german",
      category: "added-broken",
      replace: [[LEAD, `${LEAD} Write it in German.`]],
      draft: "rerecord",
      why: "The reply is in English.",
    },
  ],
} satisfies Family;
