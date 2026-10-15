import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import type { ChatRuntime, SendMessageOptions, StreamCallback } from '../../lib/runtime';
import { useFollowUpStore } from '../../queue/followUps';
import type { ChatMessage, ModelInfo } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTierStore } from '../../stores/tierStore';
import { useChat } from '../useChat';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const CONVERSATION_ID = 'conv-supersede';

const catalogModelId =
  listCanonicalModels().find((model) => {
    const reasoning = getModelReasoning(model.id);
    return reasoning.capable && reasoning.canDisableThinking !== false;
  })?.id ?? '';

function modelInfo(): ModelInfo {
  const metadata = getModelMetadataById(catalogModelId);
  if (!metadata) throw new Error('No catalog model available for the regenerate test');
  return {
    id: metadata.id,
    name: metadata.name,
    provider: metadata.provider,
    tier: 'standard',
    supportsThinking: Boolean(metadata.capabilities.thinking),
    supportsVision: Boolean(metadata.capabilities.vision),
    supportsTools: Boolean(metadata.capabilities.tools),
    contextWindow: metadata.contextWindow ?? 128_000,
    isLocal: false,
    isByok: false,
  };
}

function seedTranscript(messages: ChatMessage[]): void {
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'Regenerate',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        executionMode: 'cloud_managed',
      },
    ],
    messagesByConversation: { [CONVERSATION_ID]: messages },
    isStreaming: false,
    streamingConversationIds: {},
    activeMode: null,
    webSearchEnabled: false,
  } as never);
  const model = modelInfo();
  useModelStore.setState({
    models: [model],
    selectedModelId: model.id,
    recentModelIds: [],
    lastRoutingDecision: null,
    thinkingEnabled: false,
  });
  useTierStore.setState({ tier: 'max', currentConversationProvider: null });
}

function exchange(overrides?: {
  userMetadata?: Record<string, unknown>;
  assistantMetadata?: Record<string, unknown>;
  attachments?: ChatMessage['attachments'];
}): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'What is the plan?',
      timestamp: '2026-08-01T00:00:00.000Z',
      ...(overrides?.userMetadata ? { metadata: overrides.userMetadata } : {}),
      ...(overrides?.attachments ? { attachments: overrides.attachments } : {}),
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'A stale answer',
      timestamp: '2026-08-01T00:00:01.000Z',
      ...(overrides?.assistantMetadata ? { metadata: overrides.assistantMetadata } : {}),
    },
  ];
}

function makeRuntime(overrides?: Partial<ChatRuntime>): ChatRuntime {
  return {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => CONVERSATION_ID),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    deleteMessages: vi.fn(async () => {}),
    getPlatform: () => 'desktop',
    ...overrides,
  };
}

function answerWith(text: string) {
  return vi.fn(async (conversationId: string, _content: string, options?: SendMessageOptions) => {
    const assistantId = options?.assistantMessageId;
    if (assistantId)
      useChatStore.getState().updateMessage(conversationId, assistantId, { content: text });
  });
}

function streamingRuntime(
  overrides: Partial<ChatRuntime>,
  during: (emit: StreamCallback) => void,
): ChatRuntime {
  let callback: StreamCallback | null = null;
  return makeRuntime({
    onStream: (cb) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
    sendMessage: vi.fn(async () => {
      act(() => during((event) => callback?.(event)));
    }),
    ...overrides,
  });
}

describe('useChat, a replaced turn leaves the stored history before the new send', () => {
  beforeEach(() => {
    toastError.mockClear();
    useSettingsStore.setState({ codeExecutionEnabled: false });
  });

  it('sets the replaced rows aside before sending and lets them go after output', async () => {
    seedTranscript(exchange());
    const order: string[] = [];
    const supersedeMessages = vi.fn(async () => {
      order.push('supersede');
      return 'key-1';
    });
    const sendMessage = vi.fn(
      async (conversationId: string, content: string, options?: SendMessageOptions) => {
        order.push('send');
        await answerWith('A fresh answer')(conversationId, content, options);
      },
    );
    const releaseSupersededMessages = vi.fn(async () => {});
    const deleteMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(
        makeRuntime({ sendMessage, supersedeMessages, releaseSupersededMessages, deleteMessages }),
        { surfaceId: 'supersede-happy' },
      ),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(releaseSupersededMessages).toHaveBeenCalledWith('key-1'));
    expect(order).toEqual(['supersede', 'send']);
    expect(supersedeMessages).toHaveBeenCalledWith(CONVERSATION_ID, ['user-1', 'assistant-1']);
    expect(deleteMessages).not.toHaveBeenCalled();
  });

  it('puts the replaced rows back when the send fails', async () => {
    seedTranscript(exchange());
    const sendMessage = vi.fn(async () => {
      throw new Error('provider down');
    });
    const restoreSupersededMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(
        makeRuntime({
          sendMessage,
          supersedeMessages: vi.fn(async () => 'key-2'),
          restoreSupersededMessages,
        }),
        { surfaceId: 'supersede-reject' },
      ),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(restoreSupersededMessages).toHaveBeenCalledWith('key-2'));
    const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    expect(transcript.map((m) => m.id)).toEqual(['user-1', 'assistant-1']);
  });

  it('puts the replaced rows back when the turn ends without any output', async () => {
    seedTranscript(exchange());
    const restoreSupersededMessages = vi.fn(async () => {});
    const releaseSupersededMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(
        makeRuntime({
          sendMessage: vi.fn(async () => {}),
          supersedeMessages: vi.fn(async () => 'key-3'),
          restoreSupersededMessages,
          releaseSupersededMessages,
        }),
        { surfaceId: 'supersede-empty' },
      ),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(restoreSupersededMessages).toHaveBeenCalledWith('key-3'));
    expect(releaseSupersededMessages).not.toHaveBeenCalled();
  });

  it('counts output streamed after a steer moved the reply to a new row', async () => {
    seedTranscript(exchange());
    useFollowUpStore.setState({ byConversation: {}, held: {} } as never);
    const restoreSupersededMessages = vi.fn(async () => {});
    const releaseSupersededMessages = vi.fn(async () => {});
    const runtime = streamingRuntime(
      {
        supersedeMessages: vi.fn(async () => 'key-steer'),
        restoreSupersededMessages,
        releaseSupersededMessages,
      },
      (emit) => {
        useFollowUpStore.setState({
          byConversation: {
            [CONVERSATION_ID]: [
              {
                id: 'follow-1',
                content: 'use tabs',
                state: 'steering',
                steerId: 'steer-1',
                args: ['use tabs'],
              },
            ],
          },
        } as never);
        emit({ type: 'steer_consumed', steerId: 'steer-1' });
        emit({ type: 'content', content: 'Switching to tabs' });
      },
    );
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'supersede-steer' }));

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(releaseSupersededMessages).toHaveBeenCalledWith('key-steer'));
    expect(restoreSupersededMessages).not.toHaveBeenCalled();
    const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    expect(transcript.map((m) => [m.role, m.content])).toEqual([
      ['user', 'What is the plan?'],
      ['assistant', ''],
      ['user', 'use tabs'],
      ['assistant', 'Switching to tabs'],
    ]);
  });

  it('restores the replaced rows after a stream error and keeps the error showing', async () => {
    seedTranscript(exchange());
    useFollowUpStore.setState({ byConversation: {}, held: {} } as never);
    const restoreSupersededMessages = vi.fn(async () => {});
    const runtime = streamingRuntime(
      {
        supersedeMessages: vi.fn(async () => 'key-error'),
        restoreSupersededMessages,
      },
      (emit) => emit({ type: 'error', error: 'The provider stopped responding.' }),
    );
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'supersede-error' }));

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(restoreSupersededMessages).toHaveBeenCalledWith('key-error'));
    const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    expect(transcript.slice(0, 2).map((m) => m.id)).toEqual(['user-1', 'assistant-1']);
    expect(transcript).toHaveLength(3);
    expect(transcript[2]).toMatchObject({ role: 'assistant', isStreaming: false });
    expect(transcript[2]?.error).toBeTruthy();
  });

  it('does not send when the replaced rows cannot be set aside', async () => {
    seedTranscript(exchange());
    const sendMessage = vi.fn(async () => {});
    const restoreSupersededMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(
        makeRuntime({
          sendMessage,
          supersedeMessages: vi.fn(async () => {
            throw new Error('database locked');
          }),
          restoreSupersededMessages,
        }),
        { surfaceId: 'supersede-fails' },
      ),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(restoreSupersededMessages).not.toHaveBeenCalled();
    const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    expect(transcript.map((m) => m.id)).toEqual(['user-1', 'assistant-1']);
  });

  it('keeps the old delete-after-send behaviour for a runtime that cannot set rows aside', async () => {
    seedTranscript(exchange());
    const deleteMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage: answerWith('ok'), deleteMessages }), {
        surfaceId: 'supersede-fallback',
      }),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() =>
      expect(deleteMessages).toHaveBeenCalledWith(CONVERSATION_ID, ['user-1', 'assistant-1']),
    );
  });
});
