import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPickerModels } from '@agiworkforce/types';
import { estimateTokens } from '@agiworkforce/routing';
import {
  streamFreeChat,
  type FreeTrialChunk,
  type FreeTrialMessage,
  type ManagedChatStreamOptions,
} from '../src/features/cloud-bridge/freeTrialClient';
import {
  executeChromeManagedChat,
  MANAGED_TOOL_CONTINUATION_RETRIES,
  MAX_MANAGED_TOOL_LEGS,
  type ChromeManagedChatDependencies,
} from '../src/features/cloud-bridge/managedChatHandler';
import {
  CHAT_BROWSER_TASK_TOOL,
  CHAT_READ_PAGE_TOOL,
  chatBrowserToolDefinitions,
  parseChatBrowserToolCall,
} from '../src/features/computer-use/chatBrowserTools';
import { getBrowserToolDefinitions } from '../src/features/computer-use/browserToolDefinitions';

const ADMITTED = getPickerModels().map((model) => model.id);

function sseResponse(frames: unknown[]): Response {
  const body =
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function handoffFrame(name: string, args: Record<string, unknown>, id = 'call_1') {
  return {
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        delta: {
          tool_calls: [
            { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
          x_tool_handoff: { tool_call_ids: [id] },
        },
      },
    ],
  };
}

async function collect(stream: AsyncGenerator<FreeTrialChunk>): Promise<FreeTrialChunk[]> {
  const chunks: FreeTrialChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function stream(...chunks: FreeTrialChunk[]): AsyncGenerator<FreeTrialChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

function dependencies(
  overrides: Partial<ChromeManagedChatDependencies> = {},
): ChromeManagedChatDependencies {
  return {
    getAuthToken: vi.fn(async () => 'token'),
    getModelAccess: vi.fn(async () => ({
      subscriptionTier: 'pro',
      modelIds: ADMITTED,
      allowedAutoModes: ['auto', 'auto-economy'],
    })),
    streamChat: vi.fn(() => stream({ type: 'text', text: 'hello' }, { type: 'done' })),
    onText: vi.fn(),
    ...overrides,
  };
}

const readCall = {
  id: 'call_1',
  type: 'function' as const,
  function: { name: CHAT_READ_PAGE_TOOL, arguments: '{}' },
};

describe('chat browser tool declaration cost', () => {
  it('declares a small fraction of the full browser tool set on an ordinary turn', () => {
    const full = estimateTokens(JSON.stringify(getBrowserToolDefinitions(true, true)));
    const read = estimateTokens(JSON.stringify(chatBrowserToolDefinitions('read')));
    const act = estimateTokens(JSON.stringify(chatBrowserToolDefinitions('act')));
    expect(read).toBeLessThanOrEqual(200);
    expect(act).toBeLessThanOrEqual(400);
    expect(act * 10).toBeLessThan(full);
  });

  it('offers the action tool only on the act tier', () => {
    expect(chatBrowserToolDefinitions('read').map((tool) => tool.function.name)).toEqual([
      CHAT_READ_PAGE_TOOL,
    ]);
    expect(chatBrowserToolDefinitions('act').map((tool) => tool.function.name)).toEqual([
      CHAT_READ_PAGE_TOOL,
      CHAT_BROWSER_TASK_TOOL,
    ]);
  });

  it('accepts only exact arguments for each chat browser tool', () => {
    expect(parseChatBrowserToolCall(readCall)).toEqual({ kind: 'read_page', toolCallId: 'call_1' });
    expect(
      parseChatBrowserToolCall({
        ...readCall,
        function: { ...readCall.function, arguments: '{"x":1}' },
      }),
    ).toBeNull();
    expect(
      parseChatBrowserToolCall({
        id: 'call_2',
        function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"  Click Update  "}' },
      }),
    ).toEqual({ kind: 'browser_task', toolCallId: 'call_2', goal: 'Click Update' });
    expect(
      parseChatBrowserToolCall({
        id: 'call_3',
        function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"","url":"x"}' },
      }),
    ).toBeNull();
    expect(
      parseChatBrowserToolCall({ id: 'call_4', function: { name: 'click', arguments: '{}' } }),
    ).toBeNull();
  });
});

describe('streamFreeChat caller-declared browser tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declares the tools and yields one complete handoff without a no-result error', async () => {
    const fetchMock = vi.fn(async () => sseResponse([handoffFrame(CHAT_READ_PAGE_TOOL, {})]));
    vi.stubGlobal('fetch', fetchMock);

    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'what does this page say?' }], 'token', {
        tools: chatBrowserToolDefinitions('read'),
      }),
    );

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([
      CHAT_READ_PAGE_TOOL,
    ]);
    expect(body.tool_choice).toBe('auto');
    expect(chunks).toEqual([{ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }]);
  });

  it('sends no tools when none are declared', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([{ choices: [{ index: 0, delta: { content: 'hi' } }] }]),
    );
    vi.stubGlobal('fetch', fetchMock);
    await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'token'));
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('refuses a handoff for a tool the turn did not declare', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([handoffFrame(CHAT_BROWSER_TASK_TOOL, { goal: 'Click' })])),
    );
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'click it' }], 'token', {
        tools: chatBrowserToolDefinitions('read'),
      }),
    );
    expect(chunks.some((chunk) => chunk.type === 'tool-handoff')).toBe(false);
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
  });

  it('carries assistant tool calls and tool results in the continuation request', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([{ choices: [{ index: 0, delta: { content: 'It says hello.' } }] }]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const messages: FreeTrialMessage[] = [
      { role: 'user', content: 'what does this page say?' },
      { role: 'assistant', content: '', tool_calls: [readCall] },
      { role: 'tool', tool_call_id: 'call_1', content: 'Page text' },
    ];
    await collect(streamFreeChat(messages, 'token'));
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.messages.slice(1)).toEqual([
      { role: 'assistant', content: '', tool_calls: [readCall] },
      { role: 'tool', tool_call_id: 'call_1', content: 'Page text' },
    ]);
  });

  it('rejects a tool result without the call it answers', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const chunks = await collect(
      streamFreeChat(
        [
          { role: 'user', content: 'hi' },
          { role: 'tool', content: 'orphan' },
        ],
        'token',
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
  });
});

describe('executeChromeManagedChat tool continuation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues a long tool leg with a fresh session token, not the one the turn began with', async () => {
    const streamChat = vi
      .fn<
        (
          messages: FreeTrialMessage[],
          token: string,
          options?: ManagedChatStreamOptions,
        ) => AsyncGenerator<FreeTrialChunk>
      >()
      .mockImplementationOnce(() =>
        stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
      )
      .mockImplementationOnce(() => stream({ type: 'text', text: 'Done.' }, { type: 'done' }));
    const tokens = ['token-at-start', 'token-after-tool'];
    const getAuthToken = vi.fn(async () => tokens.shift() ?? 'token-after-tool');
    const result = await executeChromeManagedChat(
      {
        id: 'stream-fresh',
        text: 'What does this page say?',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({
        streamChat,
        getAuthToken,
        onToolHandoff: vi.fn(async () => ({
          status: 'resolved' as const,
          results: [{ toolCallId: 'call_1', content: 'Page text' }],
        })),
      }),
    );
    expect(result.status).toBe('success');
    expect(streamChat.mock.calls[0]![1]).toBe('token-at-start');
    expect(streamChat.mock.calls[1]![1]).toBe('token-after-tool');
  });

  it('runs the handed-off tool and continues the same turn with its result', async () => {
    const streamChat = vi
      .fn<
        (
          messages: FreeTrialMessage[],
          token: string,
          options?: ManagedChatStreamOptions,
        ) => AsyncGenerator<FreeTrialChunk>
      >()
      .mockImplementationOnce(() =>
        stream(
          { type: 'text', text: 'Reading. ' },
          { type: 'tool-handoff', calls: [readCall] },
          { type: 'done' },
        ),
      )
      .mockImplementationOnce(() =>
        stream({ type: 'text', text: 'It says hello.' }, { type: 'done' }),
      );
    const onToolHandoff = vi.fn(async () => ({
      status: 'resolved' as const,
      results: [{ toolCallId: 'call_1', content: 'Page text' }],
      tools: chatBrowserToolDefinitions('act'),
    }));
    const onText = vi.fn();
    const result = await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'What does this page say?',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({ streamChat, onToolHandoff, onText }),
    );

    expect(result.status).toBe('success');
    expect(onToolHandoff).toHaveBeenCalledWith([readCall]);
    expect(streamChat).toHaveBeenCalledTimes(2);
    const [firstMessages, , firstOptions] = streamChat.mock.calls[0]!;
    const [secondMessages, , secondOptions] = streamChat.mock.calls[1]!;
    expect(firstOptions?.tools?.map((tool) => tool.function.name)).toEqual([CHAT_READ_PAGE_TOOL]);
    expect(secondOptions?.tools?.map((tool) => tool.function.name)).toEqual([
      CHAT_READ_PAGE_TOOL,
      CHAT_BROWSER_TASK_TOOL,
    ]);
    expect(secondOptions?.idempotencyKey).not.toBe(firstOptions?.idempotencyKey);
    expect(secondMessages.slice(-2)).toEqual([
      { role: 'assistant', content: 'Reading. ', tool_calls: [readCall] },
      { role: 'tool', tool_call_id: 'call_1', content: 'Page text' },
    ]);
    expect(firstMessages).toBe(secondMessages);
    expect(onText.mock.calls.map(([text]) => text).join('')).toBe('Reading. It says hello.');
  });

  it('answers every handed-off call even when the executor returns fewer results', async () => {
    const streamChat = vi
      .fn()
      .mockImplementationOnce(() =>
        stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
      )
      .mockImplementationOnce(() => stream({ type: 'text', text: 'ok' }, { type: 'done' }));
    await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({
        streamChat,
        onToolHandoff: vi.fn(async () => ({ status: 'resolved' as const, results: [] })),
      }),
    );
    const continuation = streamChat.mock.calls[1]![0] as FreeTrialMessage[];
    expect(continuation.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
  });

  it('stops the turn when the user stops or declines the tool run', async () => {
    const streamChat = vi.fn(() =>
      stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
    );
    const result = await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({
        streamChat,
        onToolHandoff: vi.fn(async () => ({ status: 'cancelled' as const })),
      }),
    );
    expect(result).toMatchObject({ status: 'error', code: 'cancelled' });
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the gateway hands back a tool nobody can run', async () => {
    const result = await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({
        streamChat: vi.fn(() =>
          stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
        ),
      }),
    );
    expect(result).toMatchObject({ status: 'error', code: 'protocol_error' });
  });

  it('withholds tools on the last leg so a looping model has to answer', async () => {
    const streamChat = vi.fn(
      (_messages: FreeTrialMessage[], _token: string, options?: ManagedChatStreamOptions) =>
        options?.tools?.length
          ? stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' })
          : stream({ type: 'text', text: 'Here is what I found.' }, { type: 'done' }),
    );
    const result = await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({
        streamChat,
        onToolHandoff: vi.fn(async () => ({
          status: 'resolved' as const,
          results: [{ toolCallId: 'call_1', content: 'Page' }],
        })),
      }),
    );
    expect(result.status).toBe('success');
    expect(streamChat).toHaveBeenCalledTimes(MAX_MANAGED_TOOL_LEGS);
    expect(streamChat.mock.calls.at(-1)![2]?.tools).toBeUndefined();
  });

  it('retries a continuation the gateway refused before admitting it, then stops retrying', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const settle = async <T>(promise: Promise<T>): Promise<T> => {
      let done = false;
      void promise.finally(() => {
        done = true;
      });
      while (!done) {
        await vi.advanceTimersByTimeAsync(500);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      return promise;
    };
    try {
      const refused = (): AsyncGenerator<FreeTrialChunk> =>
        stream({
          type: 'error',
          code: 'server_error',
          message: 'This conversation already has a response in progress.',
        });
      const streamChat = vi
        .fn()
        .mockImplementationOnce(() =>
          stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
        )
        .mockImplementationOnce(refused)
        .mockImplementationOnce(() =>
          stream({ type: 'text', text: 'It says hi.' }, { type: 'done' }),
        );
      const pending = executeChromeManagedChat(
        {
          id: 'stream-1',
          text: 'Read it',
          modelSelection: 'auto',
          tools: chatBrowserToolDefinitions('read'),
        },
        dependencies({
          streamChat,
          onToolHandoff: vi.fn(async () => ({
            status: 'resolved' as const,
            results: [{ toolCallId: 'call_1', content: 'Page' }],
          })),
        }),
      );
      await expect(settle(pending)).resolves.toMatchObject({ status: 'success' });
      expect(streamChat).toHaveBeenCalledTimes(3);
      const keys = streamChat.mock.calls.map(
        (call) => (call[2] as ManagedChatStreamOptions).idempotencyKey,
      );
      expect(new Set(keys).size).toBe(3);

      const alwaysRefused = vi
        .fn()
        .mockImplementationOnce(() =>
          stream({ type: 'tool-handoff', calls: [readCall] }, { type: 'done' }),
        )
        .mockImplementation(refused);
      const failing = executeChromeManagedChat(
        {
          id: 'stream-2',
          text: 'Read it',
          modelSelection: 'auto',
          tools: chatBrowserToolDefinitions('read'),
        },
        dependencies({
          streamChat: alwaysRefused,
          onToolHandoff: vi.fn(async () => ({
            status: 'resolved' as const,
            results: [{ toolCallId: 'call_1', content: 'Page' }],
          })),
        }),
      );
      await expect(settle(failing)).resolves.toMatchObject({
        status: 'error',
        code: 'server_error',
      });
      expect(alwaysRefused).toHaveBeenCalledTimes(1 + 1 + MANAGED_TOOL_CONTINUATION_RETRIES);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry the first leg of a turn', async () => {
    const streamChat = vi.fn(() =>
      stream({ type: 'error', code: 'server_error', message: 'Unavailable.' }),
    );
    await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        tools: chatBrowserToolDefinitions('read'),
      },
      dependencies({ streamChat }),
    );
    expect(streamChat).toHaveBeenCalledOnce();
  });

  it('never offers browser tools to an unattended scheduled turn', async () => {
    const deps = dependencies();
    const result = await executeChromeManagedChat(
      {
        id: 'stream-1',
        text: 'Read it',
        modelSelection: 'auto',
        completionMode: 'unattended',
        tools: chatBrowserToolDefinitions('read'),
      },
      deps,
    );
    expect(result).toMatchObject({ status: 'error', code: 'invalid_request' });
    expect(deps.streamChat).not.toHaveBeenCalled();
  });
});
