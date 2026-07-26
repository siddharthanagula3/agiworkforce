import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTierStore } from '../../stores/tierStore';
import { useChat } from '../useChat';

const searchableModel: ModelInfo = {
  id: 'claude-sonnet-5',
  name: 'Claude Sonnet 5',
  provider: 'anthropic',
  tier: 'standard',
  supportsThinking: true,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 1_000_000,
  isLocal: false,
  isByok: false,
};

const genericOnlyModel: ModelInfo = {
  id: 'qwen-3.5-flash',
  name: 'Qwen 3.5 Flash',
  provider: 'qwen',
  tier: 'fast',
  supportsThinking: true,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 1_000_000,
  isLocal: false,
  isByok: false,
};

const localModel: ModelInfo = {
  id: 'llama-local',
  name: 'Llama Local',
  provider: 'ollama',
  tier: 'standard',
  supportsThinking: false,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: true,
  isByok: false,
};

function seedManagedConversation(model: ModelInfo) {
  useChatStore.setState({
    activeConversationId: 'conv-search',
    conversations: [
      {
        id: 'conv-search',
        title: 'Search',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        executionMode: 'cloud_managed',
      },
    ],
    messagesByConversation: { 'conv-search': [] },
    isStreaming: false,
    activeMode: null,
    webSearchEnabled: true,
  } as never);
  useModelStore.setState({
    models: [model],
    selectedModelId: model.id,
    recentModelIds: [],
    lastRoutingDecision: null,
  });
  useTierStore.setState({ tier: 'pro', currentConversationProvider: null });
}

function makeManagedRuntime(sendMessage: ChatRuntime['sendMessage']): ChatRuntime {
  return {
    sendMessage,
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-search'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    getPlatform: () => 'web',
    supportsManagedWebSearch: true,
  };
}

function seedDesktopConversation(executionMode: 'local_only' | 'byok', model: ModelInfo): void {
  useChatStore.setState({
    activeConversationId: 'conv-search',
    conversations: [
      {
        id: 'conv-search',
        title: 'Private search',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        executionMode,
      },
    ],
    messagesByConversation: { 'conv-search': [] },
    isStreaming: false,
    activeMode: null,
    webSearchEnabled: true,
  } as never);
  useModelStore.setState({
    models: [model],
    selectedModelId: model.id,
    recentModelIds: [],
    lastRoutingDecision: null,
  });
}

function makeNativeDesktopRuntime(sendMessage: ChatRuntime['sendMessage']): ChatRuntime {
  return {
    sendMessage,
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-search'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    getPlatform: () => 'desktop',
  };
}

describe('useChat — automatic Web search request clamp', () => {
  beforeEach(() => {
    useSettingsStore.setState({ genericWebSearchDeploymentEnabled: false });
  });

  it('requests search automatically when the selected managed model has a working search path', async () => {
    seedManagedConversation(searchableModel);
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeManagedRuntime(sendMessage), {
        surfaceId: 'automatic-web-search-supported',
      }),
    );

    act(() => result.current.sendMessage('What changed today?'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      'What changed today?',
      expect.objectContaining({ webSearch: true }),
    );
  });

  it('clamps the request off when managed search has no native or configured generic path', async () => {
    seedManagedConversation(genericOnlyModel);
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeManagedRuntime(sendMessage), {
        surfaceId: 'automatic-web-search-clamped',
      }),
    );

    act(() => result.current.sendMessage('What changed today?'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      'What changed today?',
      expect.objectContaining({ provider: 'qwen', webSearch: false }),
    );
  });

  it('keeps Local search on the native runtime without changing the provider boundary', async () => {
    seedDesktopConversation('local_only', localModel);
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeNativeDesktopRuntime(sendMessage), {
        surfaceId: 'automatic-web-search-local',
      }),
    );

    act(() => result.current.sendMessage('Find the latest local package notes'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      'Find the latest local package notes',
      expect.objectContaining({
        model: 'llama-local',
        provider: 'ollama',
        webSearch: true,
      }),
    );
  });

  it('keeps BYOK search on the explicit provider without changing to Managed Cloud', async () => {
    seedDesktopConversation('byok', { ...searchableModel, isByok: true });
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeNativeDesktopRuntime(sendMessage), {
        surfaceId: 'automatic-web-search-byok',
      }),
    );

    act(() => result.current.sendMessage('Explain this provider function'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      'Explain this provider function',
      expect.objectContaining({
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        webSearch: true,
      }),
    );
  });
});
