# llm-cassette

TypeScript library for record/replay of OpenAI and Anthropic API calls in
tests. When a prompt changes, TypeSafe's Jev judges whether the recorded
response is still valid, and the verdict is stored in the cassette so CI
stays deterministic. Vitest first.

Status: early development. Exact record/replay works through
`openCassette().fetch` and the `llm-cassette/vitest` fixture (global
interception). Scrubbing, hard checks and Jev matching are next (see build
order in docs/design.md).

## Docs

Read these before non-trivial changes:
- `docs/background.md`: problem, prior art, why TypeScript
- `docs/requirements.md`: MVP scope, non-goals
- `docs/design.md`: architecture, matching ladder, open questions

## Conventions
- Node 20+, TypeScript, ESM and CJS builds.
- Replay mode must never touch the network, and that includes Jev.
- Pin the Jev model version. Version the question wording.
- Never write auth headers to cassettes.

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
