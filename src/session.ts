import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ManifestMessage } from "./types.js";
import { buildSystemPrompt } from "./prompt.js";

/** Maximum number of messages to keep in the sliding window. */
const MAX_HISTORY = 40;

/**
 * Per-connection session state.
 *
 * Manages the manifest, current screen, message history (with a sliding window),
 * and a monotonically increasing sequence counter for command/result correlation.
 *
 * @example
 * ```ts
 * import { Session } from "@acprotocol/server";
 *
 * const session = new Session("session-id");
 * session.setManifest(manifest);
 * session.addMessage({ role: "user", content: "Hello" });
 * const history = session.getHistory(); // returns a copy
 * const seq = session.nextSeq(); // 0, 1, 2, ...
 * ```
 */
export class Session {
  /** Unique session identifier. */
  readonly id: string;

  /** The current ACP manifest, or `null` if not yet received. */
  manifest: ManifestMessage | null = null;

  /** The current screen ID. */
  currentScreen = "";

  private history: ChatCompletionMessageParam[] = [];
  private _seq = 0;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Sets the manifest and rebuilds the system prompt.
   *
   * If the manifest includes a `currentScreen`, it is applied.
   * The system prompt is built from the manifest and added or replaced
   * in the message history.
   *
   * @param manifest - The ACP manifest message describing the application UI.
   */
  setManifest(manifest: ManifestMessage): void {
    this.manifest = manifest;
    if (manifest.currentScreen) {
      this.currentScreen = manifest.currentScreen;
    }
    this.updateSystemPrompt(buildSystemPrompt(manifest));
  }

  /**
   * Updates the current screen ID.
   * @param screen - The screen ID to switch to.
   */
  setScreen(screen: string): void {
    this.currentScreen = screen;
  }

  /**
   * Adds a message to the conversation history.
   *
   * If the history exceeds {@link MAX_HISTORY} (40), the oldest messages
   * after the system prompt are trimmed to maintain a sliding window.
   *
   * @param msg - An OpenAI-compatible chat message.
   */
  addMessage(msg: ChatCompletionMessageParam): void {
    this.history.push(msg);
    if (this.history.length > MAX_HISTORY) {
      // Keep system prompt at index 0, trim oldest after it
      const system = this.history[0];
      const start = this.history.length - MAX_HISTORY + 1;
      this.history = [system, ...this.history.slice(start)];
    }
  }

  /**
   * Returns a shallow copy of the message history.
   * Safe to iterate without affecting the session's internal state.
   */
  getHistory(): ChatCompletionMessageParam[] {
    return [...this.history];
  }

  /**
   * Replaces the first system message in history, or prepends one.
   * @param prompt - The new system prompt content.
   */
  updateSystemPrompt(prompt: string): void {
    const idx = this.history.findIndex((m) => m.role === "system");
    if (idx >= 0) {
      this.history[idx] = { role: "system", content: prompt };
    } else {
      this.history.unshift({ role: "system", content: prompt });
    }
  }

  /**
   * Returns and increments the sequence counter.
   *
   * Each command sent to the client carries a `seq` number which the client
   * echoes back in the `result` or `confirm` message. This counter is
   * monotonically increasing per session.
   */
  nextSeq(): number {
    return this._seq++;
  }
}
