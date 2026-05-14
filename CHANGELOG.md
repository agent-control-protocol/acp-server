# Changelog

All notable changes to `@acprotocol/server` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-05-13

### Added

- **Field state visibility loop closed.** The `state` message and `result.state` field defined in ACP v2 were previously parsed but discarded by the reference server — only the screen name survived. The server now stores per-screen field state on the `Session` and injects a compact `## Current UI state` snapshot into the LLM message list before each round, regenerated each turn so the agent always sees the latest user edits without polluting persistent history.
  - `Session.setState(state)` and `Session.getStateSnapshot(screen?)` are new public methods.
  - Server's `state` handler now consumes `fields` and `canSubmit`, not just `screen`.
  - Agent loop also consumes `result.state` so commands' post-execution state flows back.
  - System prompt rules updated to instruct the agent that the snapshot is authoritative over chat history.
- **Reasoning model support.** Captures `reasoning_content` from streaming deltas (DeepSeek thinking mode, OpenAI o-series) and echoes it back in subsequent assistant messages, which these providers require for multi-round tool calling. Not surfaced to the client.
- **Smoke test script** at `scripts/smoke-state.ts` boots the server in-process, drives a fake SDK through the full state→LLM loop, and asserts the model saw the pushed values. Runnable against any OpenAI-compatible provider.

### Changed

- `tests/helpers/mock-openai.ts` gains `reasoningScenario` for testing thinking-model flows.

## [2.0.0] - 2026-03-28

### Changed

- **Aligned with ACP v2 protocol**: Updated types, schema references, and conformance tests to use `acp-v2.json`.
- **Version bump to 2.0.0** to match protocol major version.

## [0.2.0] - 2026-03-27

### Changed

- **Reduced UI actions from 14 to 8**: Removed `highlight`, `focus`, `scroll_to`, `enable`, `disable`, `select`. Renamed `fill`/`fill_field` → `set_field`.
- **Unified streaming**: Merged `chat_token` into `chat` message type with `delta: boolean` flag.
- **Bumped MAX_ROUNDS from 5 to 15** for more complex agent interactions.

### Removed

- `ChatTokenMessage` type (replaced by `chat` with `delta: true`)
- `AnimationType` enum and `animate`/`speed` properties
- 6 UI actions: `highlight`, `focus`, `scroll_to`, `enable`, `disable`, `select`

## [0.1.3] - 2026-03-23

### Fixed

- `fill_field` tool now includes field types and valid option values in its description, so the LLM knows which values are valid for select, radio, and autocomplete fields

## [0.1.2] - 2026-03-23

### Improved

- Agent now proactively fills fields when user provides matching data instead of waiting for explicit "fill the form" instructions
- Added rule: "Your primary job is to operate the UI. Whenever you can act, act."

## [0.1.1] - 2026-03-23

### Improved

- Contextual greeting on connect — agent introduces itself using persona name, role, and screen label from the manifest instead of a generic message

## [0.1.0] - 2026-03-23

### Added

- ACP v1 protocol implementation over WebSocket
- WebSocket server with per-connection session management
- OpenAI-compatible agent loop with streaming support
- Manifest-to-tools conversion (14 UI actions mapped to OpenAI tools)
- System prompt builder with manifest context injection
- CLI entry point (`npx @acprotocol/server`)
- Support for any OpenAI-compatible API via `OPENAI_BASE_URL`
- 211 tests (Vitest) with 94%+ statement coverage
- Conformance validation against ACP v1 JSON Schema (AJV 2020-12)
- Apache 2.0 license
