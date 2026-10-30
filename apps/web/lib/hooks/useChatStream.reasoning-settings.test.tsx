import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isModelLive, listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { chatCompletionEndpoint } from '@/features/chat/lib/free-quota-selection';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: authMocks.getToken }) }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

function modelFixture(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(
    (candidate) =>
      candidate.capabilities.streaming && isModelLive(candidate) && predicate(candidate),
  );
  if (!model) throw new Error('The catalog must supply the reasoning payload fixture.');
  return model;
}

const OPTIONAL_REASONING_MODEL = modelFixture(
  (model) =>
    model.reasoning?.canDisableThinking === true &&
    model.reasoning.supportedEfforts?.includes('none') === true &&
    model.reasoning.supportedEfforts.includes('high') &&
    model.reasoning.supportedEfforts.includes('low') &&
    model.reasoning.supportedEfforts.includes('max'),
);
const REQUIRED_REASONING_MODEL = modelFixture(
  (model) =>
    model.reasoning?.canDisableThinking === false &&
    (model.reasoning.supportedEfforts?.length ?? 0) > 1 &&
    Boolean(model.reasoning.request?.effortPath || model.reasoning.request?.responsesEffortPath),
);
const LIMITED_REASONING_MODEL = modelFixture(
  (model) =>
    Boolean(model.reasoning?.defaultEffort) &&
    (model.reasoning?.supportedEfforts?.length ?? 0) > 1 &&
    model.reasoning?.supportedEfforts?.includes('max') === false &&
    Boolean(model.reasoning.request?.effortPath || model.reasoning.request?.responsesEffortPath),
);
const TOGGLE_ONLY_MODEL = modelFixture(
  (model) =>
    model.reasoning?.control === 'thinking_toggle' &&
    Boolean(model.reasoning.request?.togglePath) &&
    !model.reasoning.request?.effortPath &&
    !model.reasoning.request?.responsesEffortPath,
);
const NON_REASONING_MODEL = modelFixture(
  (model) =>
    ['chat', 'search', 'multimodal'].includes(model.modelType) &&
    model.capabilities.thinking === false,
);

const CONVERSATIONS = ['reasoning-chat-a', 'reasoning-chat-b'].map((id) => ({
  id,
  title: id,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  isTemporary: true,
}));
const CHAT_A = CONVERSATIONS[0]!.id;
const CHAT_B = CONVERSATIONS[1]!.id;

type SendOptions = NonNullable<Parameters<ReturnType<typeof useChatStream>['sendMessage']>[1]>;
interface SentTurn {
  model: string;
  thinking_mode?: boolean;
  effort?: string;
}

const turns: SentTurn[] = [];

function completedStream(): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'A completed answer.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: new Headers() },
  );
}

function preferenceSnapshot() {
  const { enabled, effort, fast, byConversation } = useThinkingStore.getState();
  return structuredClone({ enabled, effort, fast, byConversation });
}

async function send(options: SendOptions = {}): Promise<SentTurn> {
  const previousCount = turns.length;
  const { result, unmount } = renderHook(() => useChatStream());
  await act(async () => {
    expect(
      await result.current.sendMessage('Explain the result.', {
        conversationId: CHAT_A,
        model: OPTIONAL_REASONING_MODEL.id,
        ...options,
      }),
    ).toBe(true);
  });
  unmount();
  expect(turns).toHaveLength(previousCount + 1);
  expect(turns[previousCount]?.model).toBe(options.model ?? OPTIONAL_REASONING_MODEL.id);
  return turns[previousCount]!;
}

beforeEach(() => {
  useChatStore.getState().reset();
  useChatStore.setState({ activeConversationId: CHAT_A, conversations: CONVERSATIONS });
  useThinkingStore.setState({ enabled: false, effort: 'medium', fast: false, byConversation: {} });
  turns.length = 0;
  authMocks.getToken.mockResolvedValue('session-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const turn = JSON.parse(String(init?.body ?? '{}')) as SentTurn;
      if (path !== chatCompletionEndpoint(turn.model)) {
        throw new Error(`Unexpected request in reasoning test: ${path}`);
      }
      turns.push(turn);
      return completedStream();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useChatStream reasoning preference precedence', () => {
  it('uses the global preference when the chat has no override', async () => {
    useThinkingStore.getState().setEffort('high');
    const before = preferenceSnapshot();

    expect(await send()).toMatchObject({ thinking_mode: true, effort: 'high' });
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('keeps chat overrides isolated while an explicit turn takes precedence', async () => {
    useThinkingStore.getState().setEffort('max');
    useThinkingStore.getState().setConversationEffort(CHAT_A, 'low');
    const before = preferenceSnapshot();

    expect(await send()).toMatchObject({ thinking_mode: true, effort: 'low' });
    expect(await send({ thinkingEnabled: true, thinkingEffort: 'high' })).toMatchObject({
      thinking_mode: true,
      effort: 'high',
    });
    expect(await send({ conversationId: CHAT_B })).toMatchObject({
      thinking_mode: true,
      effort: 'max',
    });
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('allows an explicit turn Off to override an enabled chat', async () => {
    useThinkingStore.getState().setEffort('max');
    useThinkingStore.getState().setConversationEffort(CHAT_A, 'high');
    const before = preferenceSnapshot();

    expect(await send({ thinkingEnabled: false })).toMatchObject({
      thinking_mode: false,
      effort: 'none',
    });
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('allows an explicit turn enable to override inherited none without mutating that preference', async () => {
    useThinkingStore.getState().setConversationEffort(CHAT_A, 'none');
    const before = preferenceSnapshot();

    expect(await send({ thinkingEnabled: true })).toMatchObject({
      thinking_mode: true,
      effort: OPTIONAL_REASONING_MODEL.reasoning?.defaultEffort,
    });
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('honors an explicit none effort beside an explicit enabled toggle', async () => {
    useThinkingStore.getState().setEffort('high');

    expect(await send({ thinkingEnabled: true, thinkingEffort: 'none' })).toMatchObject({
      thinking_mode: false,
      effort: 'none',
    });
  });

  it('recomputes supported payloads across models and round-trips unchanged global defaults', async () => {
    useThinkingStore.setState({ enabled: false, effort: 'max' });
    const before = preferenceSnapshot();

    expect(await send({ model: REQUIRED_REASONING_MODEL.id })).toMatchObject({
      thinking_mode: true,
      effort: REQUIRED_REASONING_MODEL.reasoning?.supportedEfforts?.[0],
    });
    const nonReasoning = await send({ model: NON_REASONING_MODEL.id });
    expect(nonReasoning).not.toHaveProperty('thinking_mode');
    expect(nonReasoning).not.toHaveProperty('effort');
    expect(await send()).toMatchObject({ thinking_mode: false, effort: 'none' });

    expect(preferenceSnapshot()).toEqual(before);
    await useThinkingStore.persist.rehydrate();
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('replaces a stale unsupported effort with the selected model default', async () => {
    useThinkingStore.getState().setEffort('max');
    const before = preferenceSnapshot();
    const turn = await send({ model: LIMITED_REASONING_MODEL.id });

    expect(turn.effort).toBe(LIMITED_REASONING_MODEL.reasoning?.defaultEffort);
    expect(LIMITED_REASONING_MODEL.reasoning?.supportedEfforts).toContain(turn.effort);
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('omits effort for a model whose reasoning route only accepts a toggle', async () => {
    useThinkingStore.getState().setEffort('high');
    const before = preferenceSnapshot();
    const turn = await send({ model: TOGGLE_ONLY_MODEL.id });

    expect(turn.thinking_mode).toBe(true);
    expect(turn).not.toHaveProperty('effort');
    expect(preferenceSnapshot()).toEqual(before);
  });

  it('captures the initiating preference before asynchronous authentication completes', async () => {
    useThinkingStore.getState().setEffort('high');
    let finishAuthentication!: (token: string) => void;
    authMocks.getToken.mockReturnValue(
      new Promise<string>((resolve) => {
        finishAuthentication = resolve;
      }),
    );
    const { result } = renderHook(() => useChatStream());
    let pendingSend!: Promise<boolean>;
    act(() => {
      pendingSend = result.current.sendMessage('Keep the original choice.', {
        conversationId: CHAT_A,
        model: OPTIONAL_REASONING_MODEL.id,
      });
    });
    await vi.waitFor(() => expect(authMocks.getToken).toHaveBeenCalled());
    useThinkingStore.getState().setEffort('none');
    await act(async () => {
      finishAuthentication('session-token');
      expect(await pendingSend).toBe(true);
    });

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ thinking_mode: true, effort: 'high' });
    expect(useThinkingStore.getState()).toMatchObject({ enabled: false, effort: 'none' });
  });

  it.each([
    { thinkingEnabled: false, thinkingEffort: 'none' as const },
    { thinkingEnabled: true, thinkingEffort: 'high' as const },
  ])(
    'continues with the original turn reasoning pair after preferences change: %j',
    async (replay) => {
      useThinkingStore.getState().setEffort('max');
      useThinkingStore.getState().setConversationEffort(CHAT_A, 'low');
      useChatStore.getState().setMessages(
        [
          {
            id: 'reasoning-source-user',
            role: 'user',
            content: 'Explain this fully.',
            createdAt: '2026-10-30T12:00:00.000Z',
            metadata: { sendReplay: replay },
          },
          {
            id: 'reasoning-truncated-assistant',
            parentId: 'reasoning-source-user',
            role: 'assistant',
            content: 'An unfinished answer',
            createdAt: '2026-10-30T12:00:01.000Z',
            model: OPTIONAL_REASONING_MODEL.id,
            metadata: { finishReason: 'length' },
          },
        ],
        CHAT_A,
      );
      const before = preferenceSnapshot();
      const { result } = renderHook(() => useChatStream());

      await act(async () => {
        await result.current.continueGeneration('reasoning-truncated-assistant');
      });

      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({
        thinking_mode: replay.thinkingEnabled,
        effort: replay.thinkingEffort,
      });
      expect(preferenceSnapshot()).toEqual(before);
    },
  );

  it.each([undefined, 'captured-edit-revision'])(
    'binds continuation edit proof to its captured content: %s',
    async (revision) => {
      const assistantId = 'captured-continuation-assistant';
      useChatStore.getState().setMessages(
        [
          {
            id: 'captured-continuation-user',
            role: 'user',
            content: 'Continue this answer.',
            createdAt: '2026-10-30T12:00:00.000Z',
          },
          {
            id: assistantId,
            role: 'assistant',
            content: 'Captured content.',
            createdAt: '2026-10-30T12:00:01.000Z',
            model: OPTIONAL_REASONING_MODEL.id,
            metadata: { finishReason: 'length', assistantContentEdit: revision },
          },
        ],
        CHAT_A,
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
          useChatStore.getState().updateMessage(
            assistantId,
            {
              content: 'A newer saved edit.',
              metadata: { assistantContentEdit: 'newer-revision' },
            },
            CHAT_A,
          );
          return completedStream();
        }),
      );
      const { result } = renderHook(() => useChatStream());

      await act(async () => {
        await result.current.continueGeneration(assistantId);
      });

      const saved = useChatStore.getState().messages.find((message) => message.id === assistantId);
      expect(saved?.content).toContain('A completed answer.');
      expect(saved?.metadata?.assistantContentEdit).toBe(revision);
      const request = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(request.messages.find((message) => message.role === 'assistant')?.content).toBe(
        'Captured content.',
      );
    },
  );

  it('keeps a historical explicit enable when the original replay has no effort and current defaults are none', async () => {
    useThinkingStore.getState().setEffort('none');
    useChatStore.getState().setMessages(
      [
        {
          id: 'historical-reasoning-user',
          role: 'user',
          content: 'Explain this fully.',
          createdAt: '2026-10-30T12:00:00.000Z',
          metadata: { sendReplay: { thinkingEnabled: true } },
        },
        {
          id: 'historical-reasoning-assistant',
          parentId: 'historical-reasoning-user',
          role: 'assistant',
          content: 'An unfinished answer',
          createdAt: '2026-10-30T12:00:01.000Z',
          model: OPTIONAL_REASONING_MODEL.id,
          metadata: { finishReason: 'length' },
        },
      ],
      CHAT_A,
    );
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.continueGeneration('historical-reasoning-assistant');
    });

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      thinking_mode: true,
      effort: OPTIONAL_REASONING_MODEL.reasoning?.defaultEffort,
    });
    expect(useThinkingStore.getState()).toMatchObject({ enabled: false, effort: 'none' });
  });
});
