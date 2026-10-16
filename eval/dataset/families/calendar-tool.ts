import { anthropic, anthropicContent, anthropicTool } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const CHANGES = "Use the tools for any calendar change.";
const ASK = 'Book a 30-minute call with Sam tomorrow at 2pm called "Roadmap sync".';

export default {
  id: "calendar-tool",
  split: "test",
  tags: ["tools"],
  request: anthropic({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: `You manage the user's calendar. ${CHANGES} Today is Monday 12 October 2026 and the user's time zone is Europe/London.`,
    messages: [{ role: "user", content: ASK }],
    tools: [
      anthropicTool(
        "create_event",
        "Create an event on the user's calendar.",
        {
          title: { type: "string" },
          start: { type: "string", description: "ISO 8601 with offset" },
          duration_minutes: { type: "integer" },
          attendees: { type: "array", items: { type: "string" } },
        },
        ["title", "start", "duration_minutes"],
      ),
      anthropicTool(
        "find_free_slots",
        "Find free slots on a date.",
        { date: { type: "string" }, duration_minutes: { type: "integer" } },
        ["date", "duration_minutes"],
      ),
    ],
  }),
  response: anthropicContent([
    { type: "text", text: "Booking that now." },
    {
      type: "tool_use",
      id: "toolu_01",
      name: "create_event",
      input: { title: "Roadmap sync", start: "2026-10-13T14:00:00+01:00", duration_minutes: 30, attendees: ["Sam"] },
    },
  ]),
  edits: [
    {
      id: "reword",
      category: "reword",
      replace: [[ASK, 'Can you put a 30-minute "Roadmap sync" call with Sam in for tomorrow at 2pm?']],
      draft: "replay",
      why: "Same booking in other words.",
    },
    {
      id: "three-pm",
      category: "different-subject",
      replace: [["at 2pm", "at 3pm"]],
      draft: "rerecord",
      why: "The call starts at 14:00.",
    },
    {
      id: "forty-five-minutes",
      category: "different-subject",
      replace: [["30-minute", "45-minute"]],
      draft: "rerecord",
      why: "The call passes duration_minutes: 30.",
    },
    {
      id: "add-attendee",
      category: "different-subject",
      replace: [["with Sam", "with Sam and Priya"]],
      draft: "rerecord",
      why: "The call invites only Sam.",
    },
    {
      id: "today-tuesday",
      category: "input-edit",
      replace: [["Today is Monday 12 October 2026", "Today is Tuesday 13 October 2026"]],
      draft: "rerecord",
      why: "Tomorrow is now the 14th; the call books the 13th.",
    },
    {
      id: "new-york",
      category: "input-edit",
      replace: [["Europe/London", "America/New_York"]],
      draft: "rerecord",
      why: "The offset should be -04:00, not +01:00.",
    },
    {
      id: "slots-description",
      category: "tools",
      replace: [["Find free slots on a date.", "Lists open time slots on a given date."]],
      draft: "replay",
      why: "Rewords a tool the reply doesn't call.",
    },
    {
      id: "delete-tool",
      category: "tools",
      patch: (body) => {
        body.tools.push(anthropicTool("delete_event", "Delete an event by id.", { id: { type: "string" } }, ["id"]));
      },
      draft: "replay",
      why: "A new tool the reply doesn't need.",
    },
    {
      id: "confirm-first",
      category: "added-broken",
      replace: [[CHANGES, "Use the tools for any calendar change, but always ask the user to confirm before creating an event."]],
      draft: "rerecord",
      why: "The reply creates the event without asking.",
    },
    {
      id: "title-case",
      category: "cosmetic",
      replace: [['called "Roadmap sync"', 'called "Roadmap Sync"']],
      draft: "rerecord",
      why: "Looks cosmetic, but the event title is now 'Roadmap Sync'.",
    },
    {
      id: "thanks",
      category: "irrelevant-addition",
      replace: [[ASK, `${ASK} Thanks!`]],
      draft: "replay",
      why: "Politeness doesn't change the booking.",
    },
    {
      id: "duration-renamed",
      category: "settings",
      patch: (body) => {
        const schema = body.tools[0].input_schema;
        schema.properties.duration = schema.properties.duration_minutes;
        delete schema.properties.duration_minutes;
        schema.required = ["title", "start", "duration"];
      },
      draft: "rerecord",
      why: "create_event now takes duration; the call passes duration_minutes.",
    },
  ],
} satisfies Family;
