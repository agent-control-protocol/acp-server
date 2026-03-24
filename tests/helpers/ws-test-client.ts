import { WebSocket } from 'ws';
import type { ServerMessage } from '../../src/types.js';

/**
 * WebSocket test client for integration testing the ACP server.
 */
export class WSTestClient {
  private ws: WebSocket | null = null;
  readonly messages: ServerMessage[] = [];
  private waiters: Array<{
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  /** Connect to the server. */
  async connect(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data: Buffer) => {
        const msg: ServerMessage = JSON.parse(data.toString());
        this.messages.push(msg);
        // Check waiters
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          const w = this.waiters[i];
          if (w.predicate(msg)) {
            clearTimeout(w.timer);
            this.waiters.splice(i, 1);
            w.resolve(msg);
          }
        }
      });
    });
  }

  /** Send a JSON message to the server. */
  send(msg: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait for a message matching a type. */
  waitForMessage(type: string, timeout = 5000): Promise<ServerMessage> {
    // Check existing messages first
    const existing = this.messages.find((m) => m.type === type);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message type="${type}"`));
      }, timeout);
      this.waiters.push({
        predicate: (m) => m.type === type,
        resolve,
        reject,
        timer,
      });
    });
  }

  /** Wait for N messages to accumulate (including already received). */
  waitForMessages(count: number, timeout = 5000): Promise<ServerMessage[]> {
    if (this.messages.length >= count) {
      return Promise.resolve(this.messages.slice(0, count));
    }
    return new Promise<ServerMessage[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === (resolve as any));
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for ${count} messages (got ${this.messages.length})`));
      }, timeout);
      this.waiters.push({
        predicate: () => this.messages.length >= count,
        resolve: (() => {
          clearTimeout(timer);
          resolve(this.messages.slice(0, count));
        }) as any,
        reject,
        timer,
      });
    });
  }

  /** Close the connection. */
  async close(): Promise<void> {
    if (!this.ws) return;
    const ws = this.ws;
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      this.ws = null;
      return;
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        ws.terminate();
        resolve();
      }, 1000);
      ws.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.close();
    });
  }

  /** Get all messages of a specific type. */
  messagesOfType<T extends ServerMessage>(type: string): T[] {
    return this.messages.filter((m) => m.type === type) as T[];
  }

  /** Clear message history. */
  clearMessages(): void {
    this.messages.length = 0;
  }
}
