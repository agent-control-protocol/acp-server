import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

/** A single chunk delta for building mock streams. */
interface MockDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Builds a ChatCompletionChunk from a delta. */
function makeChunk(delta: MockDelta): ChatCompletionChunk {
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'mock-model',
    choices: [
      {
        index: 0,
        delta: delta as any,
        finish_reason: null,
        logprobs: null,
      },
    ],
  } as ChatCompletionChunk;
}

/** Creates an async iterable from an array of chunks. */
async function* streamFromChunks(
  chunks: ChatCompletionChunk[],
): AsyncIterable<ChatCompletionChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/** Scenario: text-only response. */
export function textOnlyScenario(text: string): MockDelta[] {
  // Split text into ~3 char chunks for realistic streaming
  const deltas: MockDelta[] = [];
  for (let i = 0; i < text.length; i += 3) {
    deltas.push({ content: text.slice(i, i + 3) });
  }
  return deltas;
}

/** Scenario: single tool call. */
export function toolCallScenario(
  callId: string,
  name: string,
  args: Record<string, unknown>,
): MockDelta[] {
  const argsStr = JSON.stringify(args);
  return [
    // First chunk: tool call header
    {
      tool_calls: [
        {
          index: 0,
          id: callId,
          type: 'function',
          function: { name, arguments: '' },
        },
      ],
    },
    // Second chunk: arguments
    {
      tool_calls: [
        {
          index: 0,
          function: { arguments: argsStr },
        },
      ],
    },
  ];
}

/** Scenario: multiple parallel tool calls. */
export function parallelToolCallScenario(
  calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
): MockDelta[] {
  const deltas: MockDelta[] = [];
  // First chunk: all headers
  deltas.push({
    tool_calls: calls.map((c, i) => ({
      index: i,
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: '' },
    })),
  });
  // Subsequent chunks: arguments one by one
  for (let i = 0; i < calls.length; i++) {
    deltas.push({
      tool_calls: [
        {
          index: i,
          function: { arguments: JSON.stringify(calls[i].args) },
        },
      ],
    });
  }
  return deltas;
}

/** Scenario: content + tool calls in the same stream. */
export function mixedScenario(
  text: string,
  callId: string,
  name: string,
  args: Record<string, unknown>,
): MockDelta[] {
  return [...textOnlyScenario(text), ...toolCallScenario(callId, name, args)];
}

export interface MockOpenAIOptions {
  /** Sequence of responses — each call pops the next one. */
  responses: MockDelta[][];
  /** If true, the first call will throw an error. */
  throwOnFirstCall?: boolean;
  /** Error message to throw. */
  errorMessage?: string;
}

/**
 * Creates a mock OpenAI client that returns pre-configured streaming responses.
 * Only `chat.completions.create` is mocked — all other methods will throw.
 */
export function createMockOpenAI(options: MockOpenAIOptions) {
  let callIndex = 0;
  const calls: Array<{ messages: unknown[]; tools?: unknown[] }> = [];

  const mockClient = {
    chat: {
      completions: {
        create: async (params: any) => {
          calls.push({ messages: params.messages, tools: params.tools });
          if (options.throwOnFirstCall && callIndex === 0) {
            callIndex++;
            throw new Error(options.errorMessage ?? 'Mock error');
          }
          const deltas = options.responses[callIndex] ?? [];
          callIndex++;
          const chunks = deltas.map(makeChunk);
          return streamFromChunks(chunks);
        },
      },
    },
    /** Introspection: how many calls were made. */
    get callCount() {
      return callIndex;
    },
    /** Introspection: all call params. */
    get calls() {
      return calls;
    },
  };

  return mockClient as any;
}
