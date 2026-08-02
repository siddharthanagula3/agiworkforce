import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import type { ChatRuntime, SendMessageOptions } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTierStore } from '../../stores/tierStore';
import { useChat } from '../useChat';

/**
 * DES-C03 — desktop Cloud used to serialise `thinking_mode: false` on every
 * managed request. `apps/web/app/api/llm/v1/chat/completions/lib/
 * request-processor.ts` answers that with a 422
 * `invalid_thinking_configuration` for any model whose catalog entry sets
 * `reasoning.canDisableThinking: false`, so a demo turn on such a model failed
 * before generation. These tests pin the clamp at the send boundary.
 *
 * Model ids come from the registry, never hardcoded.
 */
function catalogModelIdWhere(predicate: (id: string) => boolean): string {
  const match = listCanonicalModels().find((model) => predicate(model.id));
  if (!match) throw new Error('No catalog model matches this reasoning shape');
  return match.id;
}

const alwaysOnModelId = catalogModelIdWhere(
  (id) => getModelReasoning(id).canDisableThinking === false,
);
const disableableModelId = catalogModelIdWhere((id) => {
  const reasoning = getModelReasoning(id);
  return reasoning.capable && reasoning.canDisableThinking !== false;
});

function modelInfo(id: string): ModelInfo {
  const metadata = getModelMetadataById(id);
  if (!metadata) throw new Error(`Model ${id} is not in the catalog`);
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

function seedManagedConversation(model: ModelInfo): void {
  useChatStore.setState({
    activeConversationId: 'conv-thinking',
    conversations: [
      {
        id: 'conv-thinking',
        title: 'Thinking',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        executionMode: 'cloud_managed',
      },
    ],
    messagesByConversation: { 'conv-thinking': [] },
    isStreaming: false,
    streamingConversationIds: {},
    activeMode: null,
    webSearchEnabled: false,
  } as never);
  useModelStore.setState({
    models: [model],
    selectedModelId: model.id,
    recentModelIds: [],
    lastRoutingDecision: null,
  });
  useTierStore.setState({ tier: 'max', currentConversationProvider: null });
}

/**
 * A typed send spy: the assertions read `mock.calls[0][2]` (the
 * `SendMessageOptions` bag), which an untyped `vi.fn()` erases to an empty
 * tuple.
 */
function makeSendSpy() {
  return vi.fn(
    async (_conversationId: string, _content: string, _options?: SendMessageOptions) => {},
  );
}

function makeCloudRuntime(sendMessage: ChatRuntime['sendMessage']): ChatRuntime {
  return {
    sendMessage,
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-thinking'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    getPlatform: () => 'desktop',
    supportsReasoningEffort: true,
  };
}

describe('useChat — extended-thinking send clamp (DES-C03)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ codeExecutionEnabled: false });
    useModelStore.setState({ thinkingEnabled: false });
  });

  it('never sends thinking_mode:false for a model that cannot disable thinking', async () => {
    seedManagedConversation(modelInfo(alwaysOnModelId));
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeCloudRuntime(sendMessage), { surfaceId: 'thinking-always-on' }),
    );

    act(() => result.current.sendMessage('Plan the demo'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    const options = sendMessage.mock.calls[0]?.[2];
    expect(options?.thinkingEnabled).toBe(true);
  });

  it('forwards an explicit off for a model that does allow disabling', async () => {
    seedManagedConversation(modelInfo(disableableModelId));
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeCloudRuntime(sendMessage), { surfaceId: 'thinking-disableable' }),
    );

    act(() => result.current.sendMessage('Plan the demo'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(sendMessage.mock.calls[0]?.[2]?.thinkingEnabled).toBe(false);
  });

  it('clamps an effort the model would reject with thinking off', async () => {
    const cappedId = catalogModelIdWhere((id) =>
      Boolean(getModelReasoning(id).maxEffortWhenThinkingDisabled),
    );
    const reasoning = getModelReasoning(cappedId);
    const supportedEfforts = reasoning.supportedEfforts ?? [];
    const tooHigh = supportedEfforts[supportedEfforts.length - 1];
    seedManagedConversation(modelInfo(cappedId));
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeCloudRuntime(sendMessage), { surfaceId: 'thinking-effort-clamp' }),
    );

    act(() => result.current.sendMessage('Plan the demo', undefined, tooHigh));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    const options = sendMessage.mock.calls[0]?.[2];
    expect(options?.thinkingEnabled).toBe(false);
    expect(options?.effort).toBe(reasoning.maxEffortWhenThinkingDisabled);
  });

  it('forwards the client-minted user and assistant ids so the durable rows are addressable', async () => {
    seedManagedConversation(modelInfo(disableableModelId));
    const sendMessage = makeSendSpy();
    const { result } = renderHook(() =>
      useChat(makeCloudRuntime(sendMessage), { surfaceId: 'thinking-ids' }),
    );

    act(() => result.current.sendMessage('Plan the demo'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    const options = sendMessage.mock.calls[0]?.[2];
    const transcript = useChatStore.getState().messagesByConversation['conv-thinking'] ?? [];
    expect(options?.userMessageId).toBe(transcript[0]?.id);
    expect(options?.assistantMessageId).toBe(transcript[1]?.id);
  });
});
