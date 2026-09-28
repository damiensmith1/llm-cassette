# llm-cassette

Record/replay for OpenAI and Anthropic API calls in tests. When a prompt
changes, [Jev](https://docs.typesafe.ai) judges whether the recorded
response is still valid, so cassettes survive prompt edits without
replaying stale answers.

Early development, not published yet. See [docs/](docs/) for the design.

## License

MIT
