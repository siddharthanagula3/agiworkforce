import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import type { ChatRuntime } from '../../lib/runtime';
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

const CONVERSATION_ID = 'conv-edit-and-resend';

const catalogModelId =
  listCanonicalModels().find((model) => {
    const reasoning = getModelReasoning(model.id);
    return reasoning.capable && reasoning.canDisableThinking !== false;
  })?.id ?? '';

function modelInfo(): ModelInfo {
  const metadata = getModelMetadataById(catalogModelId);
  if (!metadata) throw new Error('No catalog model available for the edit test');
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

function seedTranscript(messages: ChatMessage[], isStreaming = false): void {
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'Edit',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        executionMode: 'cloud_managed',
      },
    ],
    messagesByConversation: { [CONVERSATION_ID]: messages },
    isStreaming,
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

function exchange(attachments?: ChatMessage['attachments']): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'What is the plan?',
      timestamp: '2026-08-01T00:00:00.000Z',
      ...(attachments ? { attachments } : {}),
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'A stale answer',
      timestamp: '2026-08-01T00:00:01.000Z',
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

describe('useChat, edit and resend acceptance', () => {
  beforeEach(() => {
    toastError.mockClear();
    useSettingsStore.setState({ codeExecutionEnabled: false });
  });

  it('reports a started edit as accepted', () => {
    seedTranscript(exchange());
    const { result } = renderHook(() => useChat(makeRuntime(), { surfaceId: 'edit-accepted' }));

    let accepted: boolean | undefined = undefined;
    act(() => {
      accepted = result.current.editAndResend('user-1', 'What is the new plan?');
    });

    expect(accepted).toBe(true);
  });

  it('refuses an edit to a turn that carried attachments and leaves the transcript alone', () => {
    seedTranscript(
      exchange([{ id: 'att-1', name: 'brief.pdf', type: 'application/pdf', size: 1024 }]),
    );
    const { result } = renderHook(() => useChat(makeRuntime(), { surfaceId: 'edit-attachments' }));

    let accepted: boolean | undefined = undefined;
    act(() => {
      accepted = result.current.editAndResend('user-1', 'What is the new plan?');
    });

    expect(accepted).toBe(false);
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('attachments'));
    expect(useChatStore.getState().messagesByConversation[CONVERSATION_ID]).toHaveLength(2);
  });

  it('refuses an edit for a message that is not in the conversation', () => {
    seedTranscript(exchange());
    const { result } = renderHook(() => useChat(makeRuntime(), { surfaceId: 'edit-missing' }));

    let accepted: boolean | undefined = undefined;
    act(() => {
      accepted = result.current.editAndResend('missing', 'Anything');
    });

    expect(accepted).toBe(false);
  });
});
