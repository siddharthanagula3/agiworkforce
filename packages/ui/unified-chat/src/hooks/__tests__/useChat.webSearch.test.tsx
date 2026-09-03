import { act, renderHook, waitFor } from '@testing-library/react';
import { classifyTaskLocally } from '@agiworkforce/routing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';
import { createChatModelInfo } from '../../lib/modelInfo';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTierStore } from '../../stores/tierStore';
import { requireRoutableCatalogModel } from '../../test/modelCatalogFixtures';
import { useChat } from '../useChat';

const searchPrompt = 'What changed today?';
const byokPrompt = 'Explain this provider function';
const searchTaskType = classifyTaskLocally(searchPrompt, []).type;
const managedRoute = {
  taskType: searchTaskType,
  subscriptionTier: 'pro',
  trustMode: 'managed_cloud' as const,
  runtimeProfileId: 'web/cloud-chat',
};
const byokRoute = {
  taskType: classifyTaskLocally(byokPrompt, []).type,
  subscriptionTier: 'byok',
  trustMode: 'byok' as const,
  runtimeProfileId: 'desktop/byok-chat',
};

function catalogModelInfo(
  metadata: ReturnType<typeof requireRoutableCatalogModel>,
  isByok = false,
): ModelInfo {
  return createChatModelInfo({
    id: metadata.id,
    name: 'stale fixture label',
    provider: metadata.provider,
    isLocal: false,
    isByok,
  });
}

const searchableModel = catalogModelInfo(
  requireRoutableCatalogModel(
    (model) => model.capabilities.search && model.capabilities.tools,
    managedRoute,
    'a managed model with native search',
  ),
);
const genericOnlyModel = catalogModelInfo(
  requireRoutableCatalogModel(
    (model) => !model.capabilities.search && model.capabilities.tools,
    managedRoute,
    'a managed tools-capable model without native search',
  ),
);
const byokSearchableModel = catalogModelInfo(
  requireRoutableCatalogModel(
    (model) => model.capabilities.search && model.capabilities.tools,
    byokRoute,
    'a BYOK model with native search',
  ),
  true,
);

const localModel: ModelInfo = {
  id: 'fixture-local-model',
  name: 'Local Model Fixture',
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

describe('useChat, automatic Web search request clamp', () => {
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

    act(() => result.current.sendMessage(searchPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      searchPrompt,
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

    act(() => result.current.sendMessage(searchPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      searchPrompt,
      expect.objectContaining({ provider: genericOnlyModel.provider, webSearch: false }),
    );
  });

  it('keeps automatic search off in Local mode so ordinary prompts cannot cause network egress', async () => {
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
        model: localModel.id,
        provider: localModel.provider,
        webSearch: false,
      }),
    );
  });

  it('keeps BYOK search on the explicit provider without changing to Managed Cloud', async () => {
    seedDesktopConversation('byok', byokSearchableModel);
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeNativeDesktopRuntime(sendMessage), {
        surfaceId: 'automatic-web-search-byok',
      }),
    );

    act(() => result.current.sendMessage(byokPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-search',
      byokPrompt,
      expect.objectContaining({
        model: byokSearchableModel.id,
        provider: byokSearchableModel.provider,
        webSearch: true,
      }),
    );
  });
});
