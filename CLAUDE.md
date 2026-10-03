# llm-cassette

TypeScript library for record/replay of OpenAI and Anthropic API calls in
tests. When a prompt changes, TypeSafe's Jev judges whether the recorded
response is still valid, and the verdict is stored in the cassette so CI
stays deterministic. Vitest first.

Status: early development. Exact record/replay works through
`openCassette().fetch` and the `@damiensmith1/llm-cassette/vitest` fixture (global
interception), with scrubbing, hard checks and Jev judging of prompt
edits with stored verdicts, streaming as parsed SSE events, and a Vitest
run reporter. The MVP build order is complete; see open questions in
docs/design.md.

## Docs

Read these before non-trivial changes:
- `docs/background.md`: problem, prior art, why TypeScript
- `docs/requirements.md`: MVP scope, non-goals
- `docs/design.md`: architecture, matching ladder, open questions
- `docs/configuration.md`: every option and env var (keep it current when adding one)

## Conventions
- Node 22+ (`@mswjs/interceptors` 0.42+ needs it; Node 20 is EOL), TypeScript, ESM and CJS builds.
- The only required check on main is the `ci` job, which passes when every matrix job passes. Change Node versions freely; don't rename `ci`.
- Replay mode must never touch the network, and that includes Jev.
- Pin the Jev model version. Version the question wording.
- Never write auth headers to cassettes.
- `npm test` runs live judge tests (`test/judges.live.test.ts`) for Jev
  and span-01 when `.env` has `TYPESAFE_API_KEY` / `RESPAN_API_KEY`;
  skipped in CI. `SPAN_MODEL=span-01-pro` tests the paid tier.

## Keeping docs in sync

Everything under docs/ is this project's source of truth, not a one-time
snapshot — including any file added there after initial setup, not just
background.md/requirements.md/design.md. In the SAME turn as a code
change (not a followup), update the relevant doc when you:
- resolve or add an open question in design.md
- make or change an architecture/approach decision
- add, change, or drop a requirement or non-goal
- learn something that changes the "why" in background.md
- create a new doc under docs/ for a topic that doesn't fit the above

Don't fabricate a decision that wasn't actually made. If it's unclear
whether something is doc-worthy, ask instead of guessing.
