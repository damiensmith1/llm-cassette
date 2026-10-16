# Changelog

## 0.2.0 (2026-10-16)

### Changed
- **Judge question v2.** Jev's `still_valid` question now counts a tool call
  as a valid reply when calling that tool with those arguments is still the
  right next step. Under v1, harmless edits to a reply that was only a tool
  call scored ~0.3 and re-recorded; they now score ~0.9, with no new wrong
  replays in the eval ([docs/evals.md](docs/evals.md)).

  **Breaking for stored verdicts.** Judge ids are now `jev-1.13.0:v2` and
  `span-01-…:v2`, so verdicts saved under v1 no longer match. In `record`
  mode those pairs are judged again; in `replay` mode they fail ("prompt
  text changed and there's no stored verdict") until you re-record them
  once with a judge key set.

### Added
- A judge eval in `eval/` (not shipped): 151 labelled prompt edits, a
  labelling tool, a cached runner and a report of wrong-replay rates and
  thresholds per judge. `npm run eval:run`, `npm run eval:report`. See
  [docs/evals.md](docs/evals.md) and [docs/labelling.md](docs/labelling.md).

## 0.1.1 (2026-10-03)

- Document how to provide judge API keys; add `.env.example`.

## 0.1.0 (2026-10-03)

First release.

- Record/replay of OpenAI (Chat Completions, Responses) and Anthropic calls
  through a cassette session `fetch` or global interception, with Vitest and
  Jest adapters and run reporters.
- Scrubbed matching for timestamps, UUIDs and caller fields.
- Hard checks that decide whether a near-miss recording can be judged.
- Prompt edits judged by Jev (default) or span-01, with verdicts stored in
  the cassette so replay never calls a judge.
- Streamed responses recorded as parsed SSE events.
- OpenAI and OpenRouter support is in beta.
