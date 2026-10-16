import { chatTool, chatToolCall, openai } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const SYSTEM = "You are a travel assistant. Use the tools to answer; never guess live data.";
const QUESTION = "What's the weather in Tokyo right now?";
const WEATHER = "Current weather conditions for a city.";

export default {
  id: "weather-tool",
  split: "tune",
  tags: ["tools"],
  request: openai({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: QUESTION },
    ],
    tools: [
      chatTool("get_weather", WEATHER, { city: { type: "string" }, units: { type: "string", enum: ["metric", "imperial"] } }, ["city"]),
      chatTool("get_local_time", "Current local time in a city.", { city: { type: "string" } }, ["city"]),
    ],
  }),
  response: chatToolCall("get_weather", { city: "Tokyo" }),
  edits: [
    {
      id: "paraphrase",
      category: "reword",
      replace: [[QUESTION, "How's the weather in Tokyo at the moment?"]],
      draft: "replay",
      why: "Same question; get_weather for Tokyo is still the right call.",
    },
    {
      id: "osaka",
      category: "different-subject",
      replace: [["in Tokyo right", "in Osaka right"]],
      draft: "rerecord",
      why: "The call asks for Tokyo; the user now wants Osaka.",
    },
    {
      id: "asks-time",
      category: "different-subject",
      replace: [[QUESTION, "What time is it in Tokyo right now?"]],
      draft: "rerecord",
      why: "Needs get_local_time, not get_weather.",
    },
    {
      id: "fahrenheit",
      category: "added-broken",
      replace: [[QUESTION, "What's the weather in Tokyo right now, in Fahrenheit?"]],
      draft: "rerecord",
      why: "The call doesn't pass units: imperial.",
    },
    {
      id: "description-reword",
      category: "tools",
      replace: [[WEATHER, "Returns the current weather for a given city."]],
      draft: "replay",
      why: "The tool does the same thing; the call is still right.",
    },
    {
      id: "extra-tool",
      category: "tools",
      patch: (body) => {
        body.tools.push(
          chatTool("get_exchange_rate", "Exchange rate between two currencies.", { from: { type: "string" }, to: { type: "string" } }, ["from", "to"]),
        );
      },
      draft: "replay",
      why: "A new tool the reply doesn't need; get_weather is still the right call.",
    },
    {
      id: "forecast-only",
      category: "tools",
      replace: [[WEATHER, "Seven-day weather forecast for a city. Does not return current conditions."]],
      draft: "rerecord",
      why: "get_weather no longer gives current conditions, so calling it doesn't answer 'right now'.",
    },
    {
      id: "system-reword",
      category: "reword",
      replace: [[SYSTEM, "You're a travel assistant. Answer with the tools rather than guessing live data."]],
      draft: "replay",
      why: "Same instruction in other words.",
    },
    {
      id: "explicit-units",
      category: "added-broken",
      replace: [[SYSTEM, `${SYSTEM} Always pass units explicitly.`]],
      draft: "rerecord",
      why: "The recorded call omits units.",
    },
    {
      id: "typo",
      category: "cosmetic",
      replace: [[QUESTION, "Whats the weather in Tokyo right now"]],
      draft: "replay",
      why: "Typo and missing punctuation only.",
    },
    {
      id: "tokyo-japan",
      category: "reword",
      replace: [[QUESTION, "What's the weather in Tokyo, Japan right now?"]],
      draft: "replay",
      why: "Same city; city: Tokyo is still the right argument.",
    },
    {
      id: "country-required",
      category: "settings",
      patch: (body) => {
        const params = body.tools[0].function.parameters;
        params.properties.country = { type: "string" };
        params.required.push("country");
      },
      draft: "rerecord",
      why: "get_weather now requires country, which the recorded call doesn't pass.",
    },
  ],
} satisfies Family;
