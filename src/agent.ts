import type OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { Session } from './session.js';
import type { FieldState, UIAction, ResultMessage, ServerMessage } from './types.js';
import { manifestToTools, toolCallToUIAction } from './tools.js';

/**
 * Builds a compact, LLM-readable snapshot of the client-reported state for
 * the session's current screen, or `null` if no state has been reported.
 *
 * Output shape:
 * ```
 * ## Current UI state
 * Screen: deals
 * - contact: "Globex" (dirty, valid)
 * - amount: 1000
 * canSubmit: false
 * ```
 */
function buildStateSnapshot(session: Session): string | null {
  const snap = session.getStateSnapshot();
  if (!snap || !snap.fields || Object.keys(snap.fields).length === 0) {
    return null;
  }
  const lines: string[] = [
    '## Current UI state (authoritative — reflects user edits since your last turn)',
    `Screen: ${snap.screen ?? session.currentScreen}`,
  ];
  for (const [fieldId, fs] of Object.entries(snap.fields as Record<string, FieldState>)) {
    const flags: string[] = [];
    if (fs.dirty) flags.push('dirty');
    if (fs.valid === true) flags.push('valid');
    if (fs.valid === false) flags.push('invalid');
    if (fs.error) flags.push(`error: ${fs.error}`);
    const flagStr = flags.length ? ` (${flags.join(', ')})` : '';
    const rendered =
      fs.value === undefined || fs.value === null
        ? 'null'
        : typeof fs.value === 'string'
          ? `"${fs.value}"`
          : JSON.stringify(fs.value);
    lines.push(`- ${fieldId}: ${rendered}${flagStr}`);
  }
  if (snap.canSubmit !== undefined) {
    lines.push(`canSubmit: ${snap.canSubmit}`);
  }
  return lines.join('\n');
}

/**
 * Returns the LLM message list for the next round: session history plus an
 * ephemeral system message with the current UI state snapshot, if any. The
 * snapshot is *not* added to session history — it is regenerated each round
 * from the latest `setState` call so the agent always sees up-to-date state
 * without polluting persistent context.
 */
function buildMessagesForRound(session: Session): ChatCompletionMessageParam[] {
  const messages = session.getHistory();
  const snap = buildStateSnapshot(session);
  if (snap) {
    messages.push({ role: 'system', content: snap });
  }
  return messages;
}

/** Maximum number of LLM rounds before sending a fallback response. */
const MAX_ROUNDS = 15;

/** Callback to send a server message to the client. */
export type SendFn = (msg: ServerMessage) => void;

/**
 * Callback to execute UI actions on the client.
 *
 * Sends a `command` message with the given `seq` and `actions`, then waits
 * for the client's `result` (or `confirm` for ask_confirm) response.
 *
 * @param seq - Sequence number for command/result correlation.
 * @param actions - Array of UI actions to execute on the client.
 * @returns The client's result message.
 */
export type ExecuteFn = (seq: number, actions: UIAction[]) => Promise<ResultMessage>;

/**
 * Runs the streaming agent loop: LLM call → stream tokens → execute tool calls → repeat.
 *
 * The loop processes up to {@link MAX_ROUNDS} (15) rounds of tool calls.
 * In each round:
 * 1. Streams the LLM response, forwarding `chat` delta messages in real-time
 * 2. Accumulates tool call deltas from the stream
 * 3. If no tool calls → sends a final `chat` message and returns
 * 4. Converts tool calls to UIActions via {@link toolCallToUIAction}
 * 5. Executes actions on the client and maps results back to the LLM
 * 6. Continues to the next round
 *
 * If the loop exhausts all rounds, a fallback chat message is sent.
 *
 * @param openai - OpenAI client instance.
 * @param model - Model name to use for completions.
 * @param session - The current session (history, manifest, screen).
 * @param text - The user's text message.
 * @param execute - Callback to execute UI actions on the client.
 * @param send - Callback to send server messages to the client.
 */
export async function runAgentLoop(
  openai: OpenAI,
  model: string,
  session: Session,
  text: string,
  execute: ExecuteFn,
  send: SendFn,
): Promise<void> {
  // Add user message to history
  session.addMessage({ role: 'user', content: text });

  // Build tools from manifest
  const tools = session.manifest ? manifestToTools(session.manifest) : undefined;

  let lastResponseText = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const messages = buildMessagesForRound(session);

    const stream = await openai.chat.completions.create({
      model,
      messages,
      tools: tools?.length ? tools : undefined,
      stream: true,
    });

    let contentBuf = '';
    let reasoningBuf = '';
    const accToolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }> = [];

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      if (!chunk.choices?.length) continue;
      const delta = chunk.choices[0].delta;

      // Stream content tokens
      if (delta.content) {
        contentBuf += delta.content;
        send({ type: 'chat', from: 'agent', message: delta.content, delta: true });
      }

      // Reasoning models (DeepSeek thinking mode, o-series) stream a parallel
      // `reasoning_content` field with the model's internal chain-of-thought.
      // The provider REQUIRES it to be echoed back in the next assistant turn,
      // so we accumulate it here. It is not surfaced to the client.
      const reasoningDelta = (delta as { reasoning_content?: string }).reasoning_content;
      if (reasoningDelta) {
        reasoningBuf += reasoningDelta;
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          while (accToolCalls.length <= idx) {
            accToolCalls.push({ id: '', type: '', function: { name: '', arguments: '' } });
          }
          if (tc.id) accToolCalls[idx].id = tc.id;
          if (tc.type) accToolCalls[idx].type = tc.type;
          if (tc.function?.name) accToolCalls[idx].function.name = tc.function.name;
          if (tc.function?.arguments) accToolCalls[idx].function.arguments += tc.function.arguments;
        }
      }
    }

    // Build assistant message for history
    const assistantMsg: Record<string, unknown> = {
      role: 'assistant' as const,
      content: contentBuf || null,
    };
    if (reasoningBuf) {
      assistantMsg.reasoning_content = reasoningBuf;
    }
    if (accToolCalls.length > 0) {
      assistantMsg.tool_calls = accToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    session.addMessage(assistantMsg as any);

    // No tool calls → final text response
    if (accToolCalls.length === 0) {
      if (contentBuf) {
        send({ type: 'chat', from: 'agent', message: contentBuf, final: true });
      }
      return;
    }

    // Tool calls → convert to UIActions and execute
    if (contentBuf) {
      lastResponseText = contentBuf;
    }

    const roundActions: UIAction[] = [];
    const mappings: Array<{ action: UIAction; callId: string }> = [];

    for (const tc of accToolCalls) {
      try {
        const action = toolCallToUIAction(tc.function.name, tc.function.arguments);
        roundActions.push(action);
        mappings.push({ action, callId: tc.id });
      } catch (err) {
        // Report parse error back to LLM
        session.addMessage({
          role: 'tool',
          content: JSON.stringify({ error: String(err) }),
          tool_call_id: tc.id,
        });
      }
    }

    if (roundActions.length === 0) continue;

    // Check if this round is ask_confirm only
    const isConfirmOnly = roundActions.length === 1 && roundActions[0].do === 'ask_confirm';

    const seq = session.nextSeq();
    send({ type: 'status', status: 'executing' });

    let resultMsg: ResultMessage;
    try {
      // Send command and wait for result/confirm
      resultMsg = await execute(seq, roundActions);
    } catch (err) {
      // Execution failed — report to LLM
      for (const m of mappings) {
        session.addMessage({
          role: 'tool',
          content: JSON.stringify({ success: false, error: String(err) }),
          tool_call_id: m.callId,
        });
      }
      send({ type: 'status', status: 'thinking' });
      continue;
    }

    send({ type: 'status', status: 'thinking' });

    // The client may piggyback a fresh UI state snapshot on the result —
    // capture it so subsequent rounds see post-action field values.
    if (resultMsg.state) {
      session.setState(resultMsg.state);
    }

    // Map results back to tool messages
    const resultsByIndex = new Map<number, { success: boolean; error?: string }>();
    for (const r of resultMsg.results) {
      resultsByIndex.set(r.index, r);
    }

    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      const result: Record<string, unknown> = { success: true, action: m.action.do };
      const r = resultsByIndex.get(i);
      if (r) {
        result.success = r.success;
        if (!r.success && r.error) result.error = r.error;
      }
      if (m.action.do === 'navigate') {
        session.setScreen(m.action.screen!);
        result.screen = m.action.screen;
      }
      if (m.action.do === 'set_field') {
        result.field = m.action.field;
        result.value = m.action.value;
      }

      // For ask_confirm, inject the user's yes/no response
      if (isConfirmOnly && m.action.do === 'ask_confirm') {
        const confirmed = resultMsg.results[0]?.success ?? false;
        result.user_response = confirmed ? 'Yes' : 'No';
      }

      session.addMessage({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: m.callId,
      });
    }
  }

  // Ran out of rounds — send fallback
  if (lastResponseText) {
    send({ type: 'chat', from: 'agent', message: lastResponseText, final: true });
  } else {
    send({ type: 'chat', from: 'agent', message: 'Done.', final: true });
  }
}
