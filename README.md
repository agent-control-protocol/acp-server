# @acprotocol/server

[![npm version](https://img.shields.io/npm/v/@acprotocol/server)](https://www.npmjs.com/package/@acprotocol/server)
[![license](https://img.shields.io/npm/l/@acprotocol/server)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-211%20passed-brightgreen)]()

> ACP Reference Server — a minimal TypeScript server implementing the [Agent Control Protocol](https://acp-protocol.org).

> [!NOTE]
> This is a reference implementation for development, testing, and learning. For production workloads, implement the ACP protocol directly in your language/framework of choice, or see [Vocall Engine](https://vocall.emitta.com.br) for a production-grade implementation.

**MCP reads. ACP acts.** While MCP connects models to data, ACP connects AI agents to existing application user interfaces — letting them navigate screens, fill forms, click buttons, open modals, and confirm destructive actions.

## What is ACP?

The **Agent Control Protocol (ACP)** is an open protocol for AI agents to control existing application user interfaces over WebSocket. An ACP-compliant **engine** (this server) receives a UI manifest from an **SDK** (the client), then uses an LLM to interpret user requests and send UI commands back.

```
┌──────────────┐  WebSocket  ┌──────────────┐  OpenAI API  ┌─────────┐
│   ACP SDK    │◄───────────►│  ACP Engine   │◄────────────►│   LLM   │
│  (your app)  │             │ (this server) │              │         │
└──────────────┘             └──────────────┘              └─────────┘
```

The SDK sends a **manifest** describing screens, fields, actions, and modals. The engine converts this into LLM tools, processes user text through a streaming agent loop, and sends back UI commands for the SDK to execute.

## Architecture

```
@acprotocol/server
├── server.ts      WebSocket server, connection handling, message routing
├── agent.ts       Streaming agent loop (LLM → tools → execute → repeat)
├── session.ts     Per-connection state: manifest, history, seq counter
├── prompt.ts      System prompt builder from manifest
├── tools.ts       Manifest ↔ OpenAI tool conversion
├── types.ts       Full ACP v1 type definitions
├── index.ts       Public API exports
└── cli.ts         CLI entry point
```

### Protocol Lifecycle

```
SDK                          Engine                         LLM
 │                             │                              │
 │◄──── config ────────────────│                              │
 │───── manifest ─────────────►│                              │
 │◄──── status: idle ──────────│                              │
 │◄──── chat: greeting ────────│                              │
 │                             │                              │
 │───── text ─────────────────►│                              │
 │◄──── status: thinking ──────│───── stream completion ─────►│
 │◄──── chat_token ────────────│◄──── delta.content ──────────│
 │◄──── chat_token ────────────│◄──── delta.content ──────────│
 │◄──── status: executing ─────│◄──── delta.tool_calls ───────│
 │◄──── command {seq, actions}─│                              │
 │───── result {seq, results}─►│───── tool results ──────────►│
 │◄──── status: thinking ──────│◄──── delta.content ──────────│
 │◄──── chat (final) ──────────│                              │
 │◄──── status: idle ──────────│                              │
```

## Quick Start

```bash
OPENAI_API_KEY=sk-... npx @acprotocol/server
```

The server starts a WebSocket endpoint at `ws://localhost:3000/connect`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | API key for the LLM provider |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Base URL (change for Groq, DeepSeek, etc.) |
| `ACP_MODEL` | `gpt-4o` | Model name |
| `ACP_PORT` | `3000` | WebSocket port |

## Provider Examples

```bash
# OpenAI
OPENAI_API_KEY=sk-... npx @acprotocol/server

# Groq
OPENAI_API_KEY=gsk-... OPENAI_BASE_URL=https://api.groq.com/openai/v1 \
  ACP_MODEL=llama-3.3-70b-versatile npx @acprotocol/server

# DeepSeek
OPENAI_API_KEY=sk-... OPENAI_BASE_URL=https://api.deepseek.com \
  ACP_MODEL=deepseek-chat npx @acprotocol/server

# Local (LM Studio / Ollama)
OPENAI_BASE_URL=http://localhost:1234/v1 OPENAI_API_KEY=none \
  ACP_MODEL=local npx @acprotocol/server
```

## Using as a Library

```typescript
import { createServer } from "@acprotocol/server";
import OpenAI from "openai";

const server = createServer({
  openai: new OpenAI({ apiKey: "sk-..." }),
  model: "gpt-4o",
  port: 3000,
});

await server.start();
```

### API Reference

#### `createServer(options): ACPServer`

Creates a WebSocket server implementing the ACP protocol.

- `options.openai` — OpenAI client instance (supports any OpenAI-compatible API via `baseURL`)
- `options.model` — Model name for LLM completions
- `options.port` — WebSocket server port
- Returns `{ start(), stop() }`

#### `Session`

Per-connection session state with manifest, history (sliding window of 40 messages), and sequence counter.

```typescript
const session = new Session("session-id");
session.setManifest(manifest);      // stores manifest, builds system prompt
session.addMessage(msg);            // adds to history with sliding window
session.getHistory();               // returns a copy of the message history
session.nextSeq();                  // returns 0, 1, 2, ...
```

#### `buildSystemPrompt(manifest): string`

Builds a multi-section LLM system prompt from an ACP manifest. Includes identity, instructions, user context, application context, screen descriptions, and behavioral rules.

#### `manifestToTools(manifest): ChatCompletionTool[]`

Converts an ACP manifest into OpenAI-compatible tool definitions. Generates 8 base tools plus 2 modal tools when modals are present.

**Tools:** `navigate`, `fill_field`, `clear_field`, `click_action`, `highlight`, `focus`, `ask_confirm`, `show_toast`, `open_modal`, `close_modal`

#### `toolCallToUIAction(name, argsJSON): UIAction`

Converts an OpenAI tool call into an ACP UIAction for inclusion in a `command` message.

#### `runAgentLoop(openai, model, session, text, execute, send): Promise<void>`

The core agent loop. Streams LLM completions, accumulates tool calls, executes UI actions on the client, and maps results back to the LLM. Runs up to 5 rounds before sending a fallback response.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (85%+ required)
```

The test suite includes:

- **Unit tests** — prompt builder, tool conversion, session state management
- **Integration tests** — agent loop with mock OpenAI, WebSocket server lifecycle
- **Conformance tests** — AJV validation of all messages against the ACP v1 JSON Schema

## Development

```bash
npm install
npm run dev     # Run with tsx (hot reload)
npm run build   # Build with tsup
npm start       # Run built version
```

## Related

- [ACP Specification](https://github.com/agent-control-protocol/acp) — the protocol spec and JSON Schema
- [ACP Demo](https://github.com/agent-control-protocol/acp-demo) — interactive demo (Pet Registration form)
- [Live Sandbox](https://primoia.ai/sandbox) — try ACP without installing anything
- [ACP Conformance Suite](https://github.com/agent-control-protocol/acp/tree/main/conformance) — test fixtures and validators

> **MCP reads. ACP acts.** MCP connects models to data. ACP connects agents to interfaces.

## Community

- [GitHub Discussions](https://github.com/agent-control-protocol/acp/discussions) — Questions, ideas, and general discussion
- [Issue Tracker](https://github.com/agent-control-protocol/acp-server/issues) — Bug reports and feature requests
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License

Apache 2.0
