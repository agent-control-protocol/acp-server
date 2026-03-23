/**
 * @module @acp-protocol/server
 *
 * ACP Reference Server — a minimal TypeScript server implementing the
 * Agent Control Protocol (ACP) for AI agents to control existing application UIs.
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
 * ```
 *
 * Individual modules can also be imported for custom integrations:
 *
 * @example
 * ```ts
 * import { buildSystemPrompt, manifestToTools, Session, runAgentLoop } from "@acp-protocol/server";
 * ```
 *
 * @packageDocumentation
 */

// Server
export { createServer } from "./server.js";
export type { ServerOptions, ACPServer } from "./server.js";

// Session
export { Session } from "./session.js";

// Prompt builder
export { buildSystemPrompt } from "./prompt.js";

// Tool conversion
export { manifestToTools, toolCallToUIAction } from "./tools.js";

// Agent loop
export { runAgentLoop } from "./agent.js";
export type { SendFn, ExecuteFn } from "./agent.js";

// Protocol types
export type {
  // Client messages
  ClientMessage,
  ManifestMessage,
  TextMessage,
  StateMessage,
  ResultMessage,
  ConfirmMessage,
  LlmConfigMessage,
  ResponseLangConfigMessage,

  // Server messages
  ServerMessage,
  ConfigResponse,
  CommandMessage,
  ChatMessage,
  ChatTokenMessage,
  StatusMessage,
  ErrorMessage,

  // UI types
  UIAction,
  UIActionDo,
  AnimationType,
  ToastLevel,

  // Descriptor types
  ScreenDescriptor,
  FieldDescriptor,
  ActionDescriptor,
  ModalDescriptor,
  FieldType,
  SelectOption,

  // Other types
  UserInfo,
  Persona,
  ProviderInfo,
  FieldState,
  InlineState,
  ActionResult,
  AgentStatus,
} from "./types.js";
