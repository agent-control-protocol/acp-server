import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../src/agent.js';
import { Session } from '../src/session.js';
import type { ServerMessage, ResultMessage, UIAction } from '../src/types.js';
import { createCrmManifest, createMinimalManifest } from './helpers/manifest-factory.js';
import {
  createMockOpenAI,
  textOnlyScenario,
  toolCallScenario,
  parallelToolCallScenario,
  mixedScenario,
} from './helpers/mock-openai.js';

function makeSession(): Session {
  const s = new Session('test-session');
  s.setManifest(createCrmManifest());
  return s;
}

function makeSend(): { send: (msg: ServerMessage) => void; sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  return { send: (msg) => sent.push(msg), sent };
}

function makeExecute(results: ResultMessage[] = []): {
  execute: (seq: number, actions: UIAction[]) => Promise<ResultMessage>;
  calls: Array<{ seq: number; actions: UIAction[] }>;
} {
  let callIndex = 0;
  const calls: Array<{ seq: number; actions: UIAction[] }> = [];
  return {
    execute: async (seq, actions) => {
      calls.push({ seq, actions });
      const result = results[callIndex] ?? {
        type: 'result' as const,
        seq,
        results: actions.map((_, i) => ({ index: i, success: true })),
      };
      callIndex++;
      return result;
    },
    calls,
  };
}

describe('runAgentLoop', () => {
  // ── Text-only ────────────────────────────────────────────────────────────

  describe('text-only response', () => {
    it('adds user message to session history', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Hello!')],
      });
      const { send } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Hi', execute, send);

      const history = session.getHistory();
      // system + user + assistant
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('streams chat tokens to send function', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Hello!')],
      });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Hi', execute, send);

      const deltas = sent.filter((m) => m.type === 'chat' && (m as any).delta === true);
      expect(deltas.length).toBeGreaterThan(0);
      // Reconstruct text from deltas
      const text = deltas.map((t) => (t as any).message).join('');
      expect(text).toBe('Hello!');
    });

    it('sends final chat message', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Hello!')],
      });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Hi', execute, send);

      const finalChats = sent.filter(
        (m) => m.type === 'chat' && (m as any).final === true,
      );
      expect(finalChats).toHaveLength(1);
      expect(finalChats[0]).toMatchObject({
        type: 'chat',
        from: 'agent',
        message: 'Hello!',
        final: true,
      });
    });

    it('does not call execute when no tool calls', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Sure!')],
      });
      const { send } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Hello', execute, send);

      expect(calls).toHaveLength(0);
    });
  });

  // ── Tool calls ───────────────────────────────────────────────────────────

  describe('tool calls', () => {
    it('converts tool calls to UIActions and executes them', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          // Round 1: tool call
          toolCallScenario('call-1', 'navigate', { screen: 'deals' }),
          // Round 2: text response
          textOnlyScenario('Navigated to deals.'),
        ],
      });
      const { send, sent } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Go to deals', execute, send);

      expect(calls).toHaveLength(1);
      expect(calls[0].actions).toEqual([{ do: 'navigate', screen: 'deals' }]);
    });

    it('sends executing status before execute and thinking after', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'clear_field', { field: 'search' }),
          textOnlyScenario('Done.'),
        ],
      });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Clear search', execute, send);

      const statuses = sent.filter((m) => m.type === 'status').map((m) => (m as any).status);
      expect(statuses).toContain('executing');
      expect(statuses).toContain('thinking');
    });

    it('maps results back to tool messages in history', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'set_field', { field: 'contact', value: 'Globex' }),
          textOnlyScenario('Filled.'),
        ],
      });
      const { send } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Fill contact', execute, send);

      const history = session.getHistory();
      const toolMsgs = history.filter((m) => m.role === 'tool');
      expect(toolMsgs.length).toBeGreaterThanOrEqual(1);
      const content = JSON.parse((toolMsgs[0] as any).content);
      expect(content.success).toBe(true);
      expect(content.action).toBe('set_field');
      expect(content.field).toBe('contact');
      expect(content.value).toBe('Globex');
    });

    it('updates session screen on navigate', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'navigate', { screen: 'settings' }),
          textOnlyScenario('Done.'),
        ],
      });
      const { send } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Go settings', execute, send);

      expect(session.currentScreen).toBe('settings');
    });
  });

  // ── Multi-round ──────────────────────────────────────────────────────────

  describe('multi-round', () => {
    it('handles 2 rounds of tool calls before final text', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'navigate', { screen: 'deals' }),
          toolCallScenario('call-2', 'set_field', {
            field: 'contact',
            value: 'Globex',
          }),
          textOnlyScenario('Deal created.'),
        ],
      });
      const { send, sent } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Create deal', execute, send);

      expect(calls).toHaveLength(2);
      expect(mockAI.callCount).toBe(3);
      const finalChat = sent.filter((m) => m.type === 'chat');
      expect(finalChat[finalChat.length - 1]).toMatchObject({
        message: 'Deal created.',
        final: true,
      });
    });

    it('falls back after MAX_ROUNDS (15) with last text', async () => {
      const session = makeSession();
      // 15 rounds of tool calls, no text response
      const responses = Array.from({ length: 15 }, (_, i) =>
        toolCallScenario(`call-${i}`, 'clear_field', { field: 'search' }),
      );
      const mockAI = createMockOpenAI({ responses });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Loop forever', execute, send);

      // Should send a fallback chat
      const chats = sent.filter((m) => m.type === 'chat' && (m as any).final === true);
      expect(chats.length).toBeGreaterThanOrEqual(1);
      expect((chats[chats.length - 1] as any).final).toBe(true);
    });

    it("sends 'Done.' fallback when no content was ever streamed", async () => {
      const session = makeSession();
      const responses = Array.from({ length: 15 }, (_, i) =>
        toolCallScenario(`call-${i}`, 'clear_field', { field: 'search' }),
      );
      const mockAI = createMockOpenAI({ responses });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Loop', execute, send);

      const chats = sent.filter((m) => m.type === 'chat' && (m as any).final === true);
      expect((chats[chats.length - 1] as any).message).toBe('Done.');
    });
  });

  // ── ask_confirm flow ────────────────────────────────────────────────────

  describe('ask_confirm', () => {
    it('detects confirm-only round and injects user_response', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'ask_confirm', { message: 'Are you sure?' }),
          textOnlyScenario('Action confirmed.'),
        ],
      });
      const { send } = makeSend();
      const { execute } = makeExecute([
        // Simulate confirmed
        { type: 'result', seq: 0, results: [{ index: 0, success: true }] },
      ]);

      await runAgentLoop(mockAI, 'mock-model', session, 'Delete it', execute, send);

      const history = session.getHistory();
      const toolMsgs = history.filter((m) => m.role === 'tool');
      const confirmResult = JSON.parse((toolMsgs[0] as any).content);
      expect(confirmResult.user_response).toBe('Yes');
    });

    it("injects 'No' when user denies confirmation", async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'ask_confirm', { message: 'Delete?' }),
          textOnlyScenario('Cancelled.'),
        ],
      });
      const { send } = makeSend();
      const { execute } = makeExecute([
        { type: 'result', seq: 0, results: [{ index: 0, success: false }] },
      ]);

      await runAgentLoop(mockAI, 'mock-model', session, 'Delete', execute, send);

      const history = session.getHistory();
      const toolMsgs = history.filter((m) => m.role === 'tool');
      const confirmResult = JSON.parse((toolMsgs[0] as any).content);
      expect(confirmResult.user_response).toBe('No');
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe('errors', () => {
    it('reports tool parse error back to LLM and continues loop', async () => {
      const session = makeSession();
      // First round: unknown tool, second round: text response
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'unknown_tool', { foo: 'bar' }),
          textOnlyScenario('Sorry about that.'),
        ],
      });
      const { send, sent } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Do something', execute, send);

      // Execute should not have been called (unknown tool → no valid actions)
      expect(calls).toHaveLength(0);
      // Should have tool error in history
      const history = session.getHistory();
      const toolMsgs = history.filter((m) => m.role === 'tool');
      expect(toolMsgs.length).toBeGreaterThanOrEqual(1);
      const errorContent = JSON.parse((toolMsgs[0] as any).content);
      expect(errorContent.error).toContain('Unknown tool');
    });

    it('reports execution error to LLM and continues', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          toolCallScenario('call-1', 'navigate', { screen: 'deals' }),
          textOnlyScenario('An error occurred, let me try again.'),
        ],
      });
      const { send, sent } = makeSend();

      let callCount = 0;
      const execute = async (seq: number, actions: UIAction[]): Promise<ResultMessage> => {
        callCount++;
        throw new Error('Network timeout');
      };

      await runAgentLoop(mockAI, 'mock-model', session, 'Navigate', execute, send);

      expect(callCount).toBe(1);
      const history = session.getHistory();
      const toolMsgs = history.filter((m) => m.role === 'tool');
      const errorContent = JSON.parse((toolMsgs[0] as any).content);
      expect(errorContent.success).toBe(false);
      expect(errorContent.error).toContain('Network timeout');
    });
  });

  // ── Parallel tool calls ──────────────────────────────────────────────────

  describe('parallel tool calls', () => {
    it('handles multiple tool calls in one round', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          parallelToolCallScenario([
            { id: 'call-1', name: 'set_field', args: { field: 'contact', value: 'Acme' } },
            { id: 'call-2', name: 'set_field', args: { field: 'amount', value: 1000 } },
          ]),
          textOnlyScenario('Fields filled.'),
        ],
      });
      const { send } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Fill fields', execute, send);

      expect(calls).toHaveLength(1);
      expect(calls[0].actions).toHaveLength(2);
      expect(calls[0].actions[0]).toMatchObject({ do: 'set_field', field: 'contact' });
      expect(calls[0].actions[1]).toMatchObject({ do: 'set_field', field: 'amount' });
    });
  });

  // ── Mixed content + tools ─────────────────────────────────────────────────

  describe('mixed content and tools', () => {
    it('handles content and tool calls in the same stream', async () => {
      const session = makeSession();
      const mockAI = createMockOpenAI({
        responses: [
          mixedScenario('Working on it...', 'call-1', 'navigate', { screen: 'contacts' }),
          textOnlyScenario('Done.'),
        ],
      });
      const { send, sent } = makeSend();
      const { execute, calls } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Go contacts', execute, send);

      // Should have streamed text deltas
      const deltas = sent.filter((m) => m.type === 'chat' && (m as any).delta === true);
      expect(deltas.length).toBeGreaterThan(0);
      // Should have executed the tool call
      expect(calls).toHaveLength(1);
    });
  });

  // ── Manifest-less session ────────────────────────────────────────────────

  describe('no manifest', () => {
    it('runs without tools when manifest is null', async () => {
      const session = new Session('test');
      const mockAI = createMockOpenAI({
        responses: [textOnlyScenario('Hello!')],
      });
      const { send, sent } = makeSend();
      const { execute } = makeExecute();

      await runAgentLoop(mockAI, 'mock-model', session, 'Hi', execute, send);

      // Should work fine — no tools
      expect(mockAI.calls[0].tools).toBeUndefined();
      const finalChats = sent.filter(
        (m) => m.type === 'chat' && (m as any).final === true,
      );
      expect(finalChats).toHaveLength(1);
    });
  });
});
