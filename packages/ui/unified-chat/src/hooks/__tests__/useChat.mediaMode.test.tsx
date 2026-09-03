import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRuntime } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';
import { createChatModelInfo } from '../../lib/modelInfo';
import { useChatStore } from '../../stores/chatStore';
import { useMediaModeStore } from '../../stores/mediaModeStore';
import { useModelStore } from '../../stores/modelStore';
import { useTierStore } from '../../stores/tierStore';
import { requireRoutableCatalogModel } from '../../test/modelCatalogFixtures';
import { useChat } from '../useChat';

const PROMPT = 'A quiet harbour at first light';

const chatModel: ModelInfo = createChatModelInfo({
  id: requireRoutableCatalogModel(
    (model) => model.capabilities.tools,
    {
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'desktop/cloud-chat',
    },
    'a managed chat model',
  ).id,
  name: 'stale fixture label',
  provider: requireRoutableCatalogModel(
    (model) => model.capabilities.tools,
    {
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'desktop/cloud-chat',
    },
    'a managed chat model',
  ).provider,
  isLocal: false,
  isByok: false,
});

function seedConversation(): void {
  useChatStore.setState({
    activeConversationId: 'conv-media',
    conversations: [
      {
        id: 'conv-media',
        title: 'Media',
        createdAt: '2026-08-17T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
        executionMode: 'cloud_managed',
      },
    ],
    messagesByConversation: { 'conv-media': [] },
    isStreaming: false,
    activeMode: null,
  } as never);
  useModelStore.setState({
    models: [chatModel],
    selectedModelId: chatModel.id,
    recentModelIds: [],
    lastRoutingDecision: null,
  });
  useTierStore.setState({ tier: 'pro', currentConversationProvider: null });
}

function makeRuntime(
  sendMessage: ChatRuntime['sendMessage'],
  support: { image: boolean; video: boolean },
): ChatRuntime {
  return {
    sendMessage,
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-media'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    getPlatform: () => 'desktop',
    supportsImageGeneration: support.image,
    supportsVideoGeneration: support.video,
  };
}

describe('useChat, the composer media mode reaches the runtime', () => {
  beforeEach(() => {
    seedConversation();
    useMediaModeStore.setState({ mediaMode: 'text' });
  });

  it('sends mediaMode when the composer is in image mode and the runtime generates images', async () => {
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime(sendMessage, { image: true, video: false }), {
        surfaceId: 'media-mode-image',
      }),
    );

    act(() => useMediaModeStore.getState().toggleMediaMode('image'));
    act(() => result.current.sendMessage(PROMPT));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-media',
      PROMPT,
      expect.objectContaining({ mediaMode: 'image' }),
    );
  });

  it('sends no mediaMode for an ordinary text turn', async () => {
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime(sendMessage, { image: true, video: false }), {
        surfaceId: 'media-mode-text',
      }),
    );

    act(() => result.current.sendMessage(PROMPT));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-media',
      PROMPT,
      expect.not.objectContaining({ mediaMode: expect.anything() }),
    );
  });

  it('refuses to send a kind the runtime cannot generate rather than silently downgrading', async () => {
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime(sendMessage, { image: true, video: false }), {
        surfaceId: 'media-mode-unsupported',
      }),
    );

    act(() => useMediaModeStore.getState().toggleMediaMode('video'));
    act(() => result.current.sendMessage(PROMPT));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-media',
      PROMPT,
      expect.not.objectContaining({ mediaMode: expect.anything() }),
    );
  });

  it('drops back to text after the turn so the next message is an ordinary one', async () => {
    const sendMessage = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useChat(makeRuntime(sendMessage, { image: true, video: false }), {
        surfaceId: 'media-mode-reset',
      }),
    );

    act(() => useMediaModeStore.getState().toggleMediaMode('image'));
    act(() => result.current.sendMessage(PROMPT));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(useMediaModeStore.getState().mediaMode).toBe('text');
  });
});
