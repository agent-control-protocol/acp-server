# Changelog

All notable changes to `@acprotocol/server` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
