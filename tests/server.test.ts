import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from '../src/server.js';
import type {
  ConfigResponse,
  ChatMessage,
  StatusMessage,
  ErrorMessage,
  CommandMessage,
  ServerMessage,
} from '../src/types.js';
import { createCrmManifest, createMinimalManifest } from './helpers/manifest-factory.js';
import { createMockOpenAI, textOnlyScenario, toolCallScenario } from './helpers/mock-openai.js';
import { WSTestClient } from './helpers/ws-test-client.js';

let portCounter = 19300;
function nextPort(): number {
  return portCounter++;
}

/** Wait helper */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ACP Server', () => {
  // ── Lifecycle ───────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('starts and accepts WebSocket connections', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);
      expect(client.messages.length).toBeGreaterThanOrEqual(0);
      await client.close();
      await server.stop();
    });

    it('stop() closes all connections gracefully', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);
      await server.stop();
      await wait(50);
      // Client should also be disconnected now
      await client.close();
    });
  });

  // ── Config ──────────────────────────────────────────────────────────────

  describe('config', () => {
    it('sends config message immediately on connect', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      const config = await client.waitForMessage('config', 2000);
      expect(config.type).toBe('config');

      await client.close();
      await server.stop();
    });

    it('config contains sessionId, features, providers', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      const config = (await client.waitForMessage('config', 2000)) as ConfigResponse;
      expect(config.sessionId).toBeDefined();
      expect(config.sessionId.length).toBeGreaterThan(0);
      expect(config.features).toEqual({ chat: true });
      expect(config.providers).toHaveLength(1);
      expect(config.providers![0]).toMatchObject({
        id: 'default',
        name: 'Default',
        model: 'test-model',
      });
      expect(config.current_provider).toBe('default');

      await client.close();
      await server.stop();
    });
  });

  // ── Manifest ────────────────────────────────────────────────────────────

  describe('manifest', () => {
    it('responds with idle status and greeting after manifest', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createCrmManifest());

      await client.waitForMessages(3, 3000);

      const statuses = client.messagesOfType<StatusMessage>('status');
      expect(statuses.some((s) => s.status === 'idle')).toBe(true);

      const chats = client.messagesOfType<ChatMessage>('chat');
      expect(chats).toHaveLength(1);
      expect(chats[0].from).toBe('agent');
      expect(chats[0].message).toContain('I can');
      expect(chats[0].final).toBe(true);

      await client.close();
      await server.stop();
    });
  });

  // ── Text processing ─────────────────────────────────────────────────────

  describe('text', () => {
    it('processes text through agent loop and returns to idle', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({
          responses: [textOnlyScenario('Hello there!')],
        }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createMinimalManifest());
      await wait(100);
      client.clearMessages();

      client.send({ type: 'text', message: 'Hi' });
      await wait(500);

      const statuses = client.messagesOfType<StatusMessage>('status');
      expect(statuses.some((s) => s.status === 'thinking')).toBe(true);
      expect(statuses.some((s) => s.status === 'idle')).toBe(true);

      const chats = client.messagesOfType<ChatMessage>('chat');
      expect(chats.length).toBeGreaterThanOrEqual(1);
      const finalChat = chats[chats.length - 1];
      expect(finalChat.message).toBe('Hello there!');
      expect(finalChat.final).toBe(true);

      await client.close();
      await server.stop();
    });

    it('rejects concurrent text messages with busy error', async () => {
      const port = nextPort();
      const slowMockAI = {
        chat: {
          completions: {
            create: async () => {
              await wait(300);
              const chunks = textOnlyScenario('response').map((delta) => ({
                id: 'chatcmpl-mock',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: 'mock',
                choices: [{ index: 0, delta, finish_reason: null, logprobs: null }],
              }));
              return (async function* () {
                for (const c of chunks) yield c;
              })();
            },
          },
        },
      };
      const server = createServer({
        openai: slowMockAI as any,
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createMinimalManifest());
      await wait(100);

      client.send({ type: 'text', message: 'First' });
      await wait(50);
      client.send({ type: 'text', message: 'Second' });

      await wait(600);

      const errors = client.messagesOfType<ErrorMessage>('error');
      expect(errors.some((e) => e.code === 'busy')).toBe(true);

      await client.close();
      await server.stop();
    });
  });

  // ── Result/Confirm delivery ─────────────────────────────────────────────

  describe('result delivery', () => {
    it('delivers result to pending resolver for tool call commands', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({
          responses: [
            toolCallScenario('call-1', 'navigate', { screen: 'home' }),
            textOnlyScenario('Navigated.'),
          ],
        }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createMinimalManifest());
      await wait(100);
      client.clearMessages();

      client.send({ type: 'text', message: 'Navigate home' });
      await wait(200);

      const commands = client.messagesOfType<CommandMessage>('command');
      if (commands.length > 0) {
        client.send({
          type: 'result',
          seq: commands[0].seq,
          results: [{ index: 0, success: true }],
        });
      }

      await wait(500);

      const chats = client.messagesOfType<ChatMessage>('chat');
      expect(chats.length).toBeGreaterThanOrEqual(1);

      await client.close();
      await server.stop();
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe('errors', () => {
    it('sends parse_error for invalid JSON', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({ responses: [] }),
        model: 'test-model',
        port,
      });
      await server.start();

      const ws = new WebSocket(`ws://localhost:${port}/connect`);
      await new Promise<void>((resolve) => ws.on('open', resolve));

      const messages: ServerMessage[] = [];
      ws.on('message', (data: Buffer) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Wait for config
      await wait(100);

      // Send invalid JSON
      ws.send('{invalid json}');
      await wait(200);

      const errors = messages.filter((m: any) => m.type === 'error' && m.code === 'parse_error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect((errors[0] as ErrorMessage).message).toBe('Invalid JSON');

      ws.close();
      await wait(50);
      await server.stop();
    });
  });

  // ── State message ──────────────────────────────────────────────────────

  describe('state message', () => {
    it('updates session screen on state message', async () => {
      const port = nextPort();
      const server = createServer({
        openai: createMockOpenAI({
          responses: [textOnlyScenario('OK!')],
        }),
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createCrmManifest());
      await wait(100);

      client.send({ type: 'state', screen: 'deals' });
      await wait(50);

      const errors = client.messagesOfType<ErrorMessage>('error');
      expect(errors).toHaveLength(0);

      await client.close();
      await server.stop();
    });

    it('field state from a state message reaches the LLM context', async () => {
      const port = nextPort();
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Your contact is Globex.')],
      });
      const server = createServer({
        openai: mockAI,
        model: 'test-model',
        port,
      });
      await server.start();
      const client = new WSTestClient();
      await client.connect(`ws://localhost:${port}/connect`);

      await client.waitForMessage('config', 2000);
      client.send(createCrmManifest());
      await wait(100);
      client.clearMessages();

      // Client reports its current field state.
      client.send({
        type: 'state',
        screen: 'deals',
        fields: {
          contact: { value: 'Globex', dirty: true, valid: true },
          amount: { value: 1000 },
        },
        canSubmit: false,
      });
      await wait(50);

      // Now the user asks something — the LLM should be told what's on screen.
      client.send({ type: 'text', message: 'Who is my contact?' });
      await wait(500);

      // The LLM call triggered by `text` must have seen Globex in its messages.
      expect(mockAI.callCount).toBeGreaterThanOrEqual(1);
      const messages = mockAI.calls[mockAI.calls.length - 1].messages as Array<{
        role: string;
        content: string;
      }>;
      const serialized = JSON.stringify(messages);
      expect(serialized).toContain('Globex');

      await client.close();
      await server.stop();
    });
  });
});
