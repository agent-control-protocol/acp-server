# Changelog

All notable changes to `@acp-protocol/server` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-03-23

### Added

- ACP v1 protocol implementation over WebSocket
- WebSocket server with per-connection session management
- OpenAI-compatible agent loop with streaming support
- Manifest-to-tools conversion (14 UI actions mapped to OpenAI tools)
- System prompt builder with manifest context injection
- CLI entry point (`npx @acp-protocol/server`)
- Support for any OpenAI-compatible API via `OPENAI_BASE_URL`
- 211 tests (Vitest) with 94%+ statement coverage
- Conformance validation against ACP v1 JSON Schema (AJV 2020-12)
- Apache 2.0 license
