/**
 * Live smoke test for the field-state → LLM-context loop.
 *
 * Boots the local ACP reference server in-process, opens a WebSocket as a
 * fake SDK, pushes a manifest plus a `state` message with a field value
 * pre-filled by "the user," then asks a question that can only be answered
 * if the LLM saw that state. Prints the full conversation and exits non-zero
 * if the response does not reflect the state.
 *
 * Run:
 *   OPENAI_API_KEY=... OPENAI_BASE_URL=... ACP_MODEL=... \
 *     npx tsx scripts/smoke-state.ts
 *
 * DeepSeek shortcut:
 *   OPENAI_API_KEY=sk-... \
 *   OPENAI_BASE_URL=https://api.deepseek.com \
 *   ACP_MODEL=deepseek-chat \
 *     npx tsx scripts/smoke-state.ts
 */

import OpenAI from 'openai';
import { WebSocket } from 'ws';
import { createServer } from '../src/server.js';
import type {
  ManifestMessage,
  ServerMessage,
  ChatMessage,
} from '../src/types.js';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.ACP_MODEL ?? 'gpt-4o-mini';
const port = parseInt(process.env.ACP_PORT ?? '13999', 10);

if (!apiKey) {
  console.error('Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL, ACP_MODEL).');
  process.exit(2);
}

const log = (tag: string, payload: unknown) => {
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  console.log(`[${tag}] ${s}`);
};

const openai = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

const server = createServer({ openai, model, port });
await server.start();
log('server', `ws://localhost:${port}/connect  (model=${model})`);

const ws = new WebSocket(`ws://localhost:${port}/connect`);
const received: ServerMessage[] = [];

ws.on('message', (data) => {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  received.push(msg);
  // Print server→client traffic, but collapse streaming chat deltas
  if (msg.type === 'chat' && (msg as ChatMessage).delta) {
    process.stdout.write((msg as ChatMessage).message ?? '');
  } else if (msg.type === 'chat' && (msg as ChatMessage).final) {
    process.stdout.write('\n');
    log('server→', { type: 'chat', final: true });
  } else {
    log('server→', msg);
  }
});

const send = (m: unknown) => {
  log('client→', m);
  ws.send(JSON.stringify(m));
};

const waitFor = (predicate: (m: ServerMessage) => boolean, timeoutMs = 20000) =>
  new Promise<ServerMessage>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const tick = () => {
      const hit = received.find(predicate);
      if (hit) {
        clearTimeout(t);
        resolve(hit);
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });

await new Promise<void>((resolve, reject) => {
  ws.once('open', () => resolve());
  ws.once('error', reject);
});

// 1) Wait for the server config message.
await waitFor((m) => m.type === 'config');

// 2) Send a manifest describing a "deals" screen with a contact field.
const manifest: ManifestMessage = {
  type: 'manifest',
  app: 'smoke-state',
  currentScreen: 'deals',
  screens: {
    deals: {
      id: 'deals',
      label: 'Deal',
      fields: [
        { id: 'contact', type: 'text', label: 'Contact' },
        { id: 'amount', type: 'currency', label: 'Amount' },
      ],
      actions: [{ id: 'create', label: 'Create Deal' }],
    },
  },
  persona: {
    name: 'Aria',
    role: 'sales assistant',
    instructions:
      'You help the user complete a deal. Be concise. If asked about field values, report them exactly as you see them in the current UI state.',
  },
};
send(manifest);

// Let the greeting flow.
await new Promise((r) => setTimeout(r, 400));

// 3) Push a `state` message — what the user has *typed*, not what we set.
const SENTINEL_CONTACT = 'Globex Corporation';
const SENTINEL_AMOUNT = 42_000;
send({
  type: 'state',
  screen: 'deals',
  fields: {
    contact: { value: SENTINEL_CONTACT, dirty: true, valid: true },
    amount: { value: SENTINEL_AMOUNT, dirty: true, valid: true },
  },
  canSubmit: true,
});

await new Promise((r) => setTimeout(r, 200));

// 4) Ask a question that can only be answered if the LLM saw state.
const sentBefore = received.length;
send({
  type: 'text',
  message:
    "Without asking me anything: what contact and amount are currently on the deals screen?",
});

// 5) Wait for the final chat reply.
const reply = (await waitFor(
  (m, idx?) =>
    m.type === 'chat' && (m as ChatMessage).final === true && received.indexOf(m) >= sentBefore,
  20000,
)) as ChatMessage;

log('assert', `final chat: "${reply.message}"`);

const ok =
  reply.message.includes(SENTINEL_CONTACT) ||
  reply.message.toLowerCase().includes('globex');

const okAmount =
  reply.message.includes(String(SENTINEL_AMOUNT)) ||
  reply.message.includes('42,000') ||
  reply.message.includes('42.000');

ws.close();
await server.stop();

if (ok && okAmount) {
  console.log('\nPASS — the LLM saw the state pushed by the client.');
  process.exit(0);
} else {
  console.log('\nFAIL — the LLM reply did not reflect the pushed state.');
  console.log(`  expected mentions of "${SENTINEL_CONTACT}" and ${SENTINEL_AMOUNT}`);
  process.exit(1);
}
