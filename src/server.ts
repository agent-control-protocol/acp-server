import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type OpenAI from "openai";
import type {
  ClientMessage,
  ManifestMessage,
  ResultMessage,
  ConfirmMessage,
  ServerMessage,
  UIAction,
} from "./types.js";
import { Session } from "./session.js";
import { runAgentLoop } from "./agent.js";

/** Timeout in milliseconds for waiting on a client result/confirm. */
const EXECUTE_TIMEOUT_MS = 30_000;

/**
 * Configuration options for creating an ACP server.
 */
export interface ServerOptions {
  /** OpenAI client instance (supports any OpenAI-compatible API via `baseURL`). */
  openai: OpenAI;
  /** Model name for LLM completions (e.g. `"gpt-4o"`, `"claude-sonnet-4-5-20250929"`). */
  model: string;
  /** WebSocket server port. */
  port: number;
}

/**
 * An ACP server instance with lifecycle methods.
 */
export interface ACPServer {
  /** Starts the WebSocket server and begins accepting connections. */
  start(): Promise<void>;
  /** Stops the server and closes all active connections. */
  stop(): Promise<void>;
}

/**
 * Creates an ACP reference server.
 *
 * The server listens for WebSocket connections on `/connect` and implements
 * the full ACP v1 text protocol: manifest, text, state, result, confirm,
 * llm_config, and response_lang_config messages.
 *
 * @param options - Server configuration.
 * @returns An {@link ACPServer} with `start()` and `stop()` methods.
 *
 * @example
 * ```ts
 * import { createServer } from "@acp-protocol/server";
 * import OpenAI from "openai";
 *
 * const server = createServer({
 *   openai: new OpenAI({ apiKey: "sk-..." }),
 *   model: "gpt-4o",
 *   port: 3000,
 * });
 * await server.start();
 * // server is now accepting connections at ws://localhost:3000/connect
 * ```
 */
export function createServer(options: ServerOptions): ACPServer {
  const { openai, model, port } = options;
  let wss: WebSocketServer | null = null;

  return {
    async start() {
      wss = new WebSocketServer({ port, path: "/connect" });
      wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        handleConnection(ws, openai, model);
      });
    },

    async stop() {
      if (!wss) return;
      for (const ws of wss.clients) {
        ws.close(1001, "Server shutting down");
      }
      await new Promise<void>((resolve) => wss!.close(() => resolve()));
      wss = null;
    },
  };
}

// ── Connection Handler ──────────────────────────────────────────────────────

function handleConnection(ws: WebSocket, openai: OpenAI, model: string): void {
  const sessionId = randomUUID();
  const session = new Session(sessionId);

  // Pending result/confirm resolvers: seq → resolver
  const pendingResults = new Map<number, (msg: ResultMessage) => void>();
  const pendingConfirms = new Map<number, (confirmed: boolean) => void>();

  // Whether the agent is currently processing (prevent concurrent runs)
  let processing = false;

  const send = (msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // Send config on connect
  send({
    type: "config",
    sessionId,
    features: { chat: true },
    providers: [{ id: "default", name: "Default", model }],
    current_provider: "default",
  });

  // Keepalive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30_000);

  ws.on("close", () => {
    clearInterval(pingInterval);
    // Clean up any pending resolvers
    for (const [, reject] of pendingResults) {
      // Will be caught by the timeout
    }
    pendingResults.clear();
    pendingConfirms.clear();
  });

  ws.on("message", (data: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send({ type: "error", code: "parse_error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "manifest":
        handleManifest(msg, session, send, openai, model);
        break;

      case "text":
        if (!msg.message) return;
        if (processing) {
          send({ type: "error", code: "busy", message: "Already processing a request" });
          return;
        }
        processing = true;
        handleText(msg.message, session, openai, model, send, makeExecuteFn(send, session, pendingResults, pendingConfirms))
          .finally(() => { processing = false; });
        break;

      case "state":
        session.setScreen(msg.screen);
        break;

      case "result":
        deliverResult(msg, pendingResults);
        break;

      case "confirm":
        deliverConfirm(msg, pendingConfirms, session, openai, model, send, makeExecuteFn(send, session, pendingResults, pendingConfirms));
        break;

      case "llm_config":
        // Acknowledge (single-provider server — no-op)
        break;

      case "response_lang_config":
        // Acknowledge
        break;
    }
  });
}

// ── Message Handlers ────────────────────────────────────────────────────────

function handleManifest(
  msg: ManifestMessage,
  session: Session,
  send: (msg: ServerMessage) => void,
  openai: OpenAI,
  model: string,
): void {
  session.setManifest(msg);
  send({ type: "status", status: "idle" });

  // Send greeting
  const name = msg.persona?.name ?? "assistant";
  send({
    type: "chat",
    from: "agent",
    message: `Connected. How can I help?`,
    final: true,
  });
}

async function handleText(
  text: string,
  session: Session,
  openai: OpenAI,
  model: string,
  send: (msg: ServerMessage) => void,
  execute: (seq: number, actions: UIAction[]) => Promise<ResultMessage>,
): Promise<void> {
  send({ type: "status", status: "thinking" });

  try {
    await runAgentLoop(openai, model, session, text, execute, send);
  } catch (err) {
    console.error("[acp-server] Agent error:", err);
    send({ type: "error", code: "agent_error", message: String(err) });
  }

  send({ type: "status", status: "idle" });
}

function deliverResult(
  msg: ResultMessage,
  pendingResults: Map<number, (msg: ResultMessage) => void>,
): void {
  const resolver = pendingResults.get(msg.seq);
  if (resolver) {
    pendingResults.delete(msg.seq);
    resolver(msg);
  }
}

function deliverConfirm(
  msg: ConfirmMessage,
  pendingConfirms: Map<number, (confirmed: boolean) => void>,
  session: Session,
  openai: OpenAI,
  model: string,
  send: (m: ServerMessage) => void,
  execute: (seq: number, actions: UIAction[]) => Promise<ResultMessage>,
): void {
  const resolver = pendingConfirms.get(msg.seq);
  if (resolver) {
    pendingConfirms.delete(msg.seq);
    resolver(msg.confirmed);
  }
}

// ── Execute Function ────────────────────────────────────────────────────────

function makeExecuteFn(
  send: (msg: ServerMessage) => void,
  session: Session,
  pendingResults: Map<number, (msg: ResultMessage) => void>,
  pendingConfirms: Map<number, (confirmed: boolean) => void>,
): (seq: number, actions: UIAction[]) => Promise<ResultMessage> {
  return (seq: number, actions: UIAction[]): Promise<ResultMessage> => {
    // Detect if this is a confirm-only command
    const isConfirmOnly =
      actions.length === 1 && actions[0].do === "ask_confirm";

    // Send command to client
    send({ type: "command", seq, actions });

    if (isConfirmOnly) {
      // Wait for confirm message instead of result
      return new Promise<ResultMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingConfirms.delete(seq);
          reject(new Error(`Timeout waiting for confirm seq=${seq}`));
        }, EXECUTE_TIMEOUT_MS);

        pendingConfirms.set(seq, (confirmed: boolean) => {
          clearTimeout(timer);
          // Wrap confirmation as a ResultMessage
          resolve({
            type: "result",
            seq,
            results: [{ index: 0, success: confirmed }],
          });
        });
      });
    }

    // Wait for result message
    return new Promise<ResultMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingResults.delete(seq);
        reject(new Error(`Timeout waiting for result seq=${seq}`));
      }, EXECUTE_TIMEOUT_MS);

      pendingResults.set(seq, (result: ResultMessage) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  };
}
