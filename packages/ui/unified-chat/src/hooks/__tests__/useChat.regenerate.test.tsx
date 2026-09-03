import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import type { ChatRuntime, SendMessageOptions } from '../../lib/runtime';
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

const CONVERSATION_ID = 'conv-regenerate';

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

function makeSendSpy() {
  return vi.fn(
    async (_conversationId: string, _content: string, _options?: SendMessageOptions) => {},
  );
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

describe('useChat, regenerate (DES-C04)', () => {
  beforeEach(() => {
    toastError.mockClear();
    useSettingsStore.setState({ codeExecutionEnabled: false });
  });

  it('replaces the exchange and re-sends the original prompt', async () => {
    seedTranscript(exchange());
    const sendMessage = makeSendSpy();
    const deleteMessages = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage, deleteMessages }), { surfaceId: 'regenerate-happy' }),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage.mock.calls[0]?.[1]).toBe('What is the plan?');

    const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
    expect(transcript.map((m) => m.id)).not.toContain('assistant-1');
    expect(transcript).toHaveLength(2);
    expect(transcript[0]?.content).toBe('What is the plan?');

    await waitFor(() => expect(deleteMessages).toHaveBeenCalledOnce());
    expect(deleteMessages).toHaveBeenCalledWith(CONVERSATION_ID, ['user-1', 'assistant-1']);
  });

  it('restores the exact transcript and keeps the server rows when the resend throws', async () => {
    seedTranscript(exchange());
    const deleteMessages = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {
      throw new Error('Cloud is unreachable');
    });
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage, deleteMessages }), { surfaceId: 'regenerate-restore' }),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    await waitFor(() => {
      const transcript = useChatStore.getState().messagesByConversation[CONVERSATION_ID] ?? [];
      expect(transcript.map((m) => m.id)).toEqual(['user-1', 'assistant-1']);
    });
    expect(deleteMessages).not.toHaveBeenCalled();
  });

  it('refuses a skill-guided turn instead of silently dropping the skill', async () => {
    seedTranscript(exchange({ userMetadata: { sendReplay: { hasSkillInstruction: true } } }));
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage }), { surfaceId: 'regenerate-skill' }),
    );

    act(() => result.current.regenerate('assistant-1'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('skill'));
    expect(useChatStore.getState().messagesByConversation[CONVERSATION_ID]).toHaveLength(2);
  });

  it('refuses a turn whose prompt carried attachments', async () => {
    seedTranscript(
      exchange({
        attachments: [{ id: 'att-1', name: 'brief.pdf', type: 'application/pdf', size: 1024 }],
      }),
    );
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage }), { surfaceId: 'regenerate-attachments' }),
    );

    act(() => result.current.regenerate('assistant-1'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('attachments'));
  });

  it('replays the recorded work mode rather than the current composer state', async () => {
    seedTranscript(
      exchange({
        userMetadata: { sendReplay: { workMode: 'agiwork', webSearchEnabled: true } },
      }),
    );
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage }), { surfaceId: 'regenerate-replay' }),
    );

    act(() => result.current.regenerate('assistant-1'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    const options = sendMessage.mock.calls[0]?.[2];
    expect(options?.workMode).toBe('agiwork');
    expect(options?.webSearch).toBe(true);
  });

  it('does nothing when the runtime cannot delete the superseded durable rows', () => {
    seedTranscript(exchange());
    const sendMessage = makeSendSpy();
    const runtime = makeRuntime({ sendMessage });
    delete (runtime as { deleteMessages?: unknown }).deleteMessages;
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'regenerate-no-delete' }));

    act(() => result.current.regenerate('assistant-1'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation[CONVERSATION_ID]).toHaveLength(2);
  });

  it('does nothing when the target has no preceding user turn', () => {
    seedTranscript([
      {
        id: 'assistant-orphan',
        role: 'assistant',
        content: 'Orphan',
        timestamp: '2026-08-01T00:00:00.000Z',
      },
    ]);
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeRuntime({ sendMessage }), { surfaceId: 'regenerate-orphan' }),
    );

    act(() => result.current.regenerate('assistant-orphan'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation[CONVERSATION_ID]).toHaveLength(1);
  });
});
