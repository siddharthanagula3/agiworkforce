import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { classifyTaskLocally } from '@agiworkforce/routing';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useTierStore } from '../../stores/tierStore';
import { createChatModelInfo } from '../../lib/modelInfo';
import {
  requireRoutableCatalogModel,
  requireSelectedCatalogRoute,
} from '../../test/modelCatalogFixtures';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';

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

function makeFakeRuntime() {
  let capturedCallback: StreamCallback | null = null;
  const runtime: ChatRuntime = {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    onStream: (cb: StreamCallback) => {
      capturedCallback = cb;
      return () => {
        capturedCallback = null;
      };
    },
  };
  return {
    runtime,
    emit: (event: Parameters<StreamCallback>[0]) => {
      if (!capturedCallback) throw new Error('onStream callback not registered yet');
      act(() => capturedCallback!(event));
    },
  };
}

function lastAssistantMessage() {
  const convId = useChatStore.getState().activeConversationId!;
  return useChatStore
    .getState()
    .messagesByConversation[convId]?.find((m) => m.role === 'assistant');
}

describe('useChat — tool call left stuck at running on a transport-level error', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: { 'conv-1': [] },
      isStreaming: false,
    } as never);
  });

  it("patches an approved-and-running tool call to 'failed' when the turn errors out before it reports a result", () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'content', content: '' });
    emit({ type: 'tool_call', toolCall: { id: 'call_1', name: 'read_file', args: {} } });
    expect(lastAssistantMessage()?.toolCalls?.[0]?.status).toBe('running');

    emit({ type: 'error', error: 'Network request failed' });

    const finalCall = lastAssistantMessage()?.toolCalls?.[0];
    expect(finalCall?.status).toBe('failed');
    expect(finalCall?.error).toBe('Network request failed');
  });

  it('does not touch a tool call that already completed before the error', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'content', content: '' });
    emit({ type: 'tool_call', toolCall: { id: 'call_1', name: 'read_file', args: {} } });
    emit({ type: 'tool_result', toolCallId: 'call_1', result: 'file contents' });
    expect(lastAssistantMessage()?.toolCalls?.[0]?.status).toBe('completed');

    emit({ type: 'error', error: 'Network request failed' });

    const finalCall = lastAssistantMessage()?.toolCalls?.[0];
    expect(finalCall?.status).toBe('completed');
    expect(finalCall?.result).toBe('file contents');
  });

  it('is a no-op on toolCalls when there is no assistant message in flight at all', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    expect(() => emit({ type: 'error', error: 'Network request failed' })).not.toThrow();
  });
});

describe('useChat — addMsg forwards the real fields on message creation', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: { 'conv-1': [] },
      isStreaming: false,
    } as never);
  });

  it('keeps provider reasoning in the shared collapsible thinking block', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({
      type: 'thinking',
      content: 'Analyze the request and choose a concise response.',
      completed: true,
      durationMs: 27_300,
    });
    emit({ type: 'content', content: 'Hello!' });
    emit({ type: 'done' });

    const message = lastAssistantMessage();
    expect(message?.thinking).toBe('Analyze the request and choose a concise response.');
    expect(message?.thinkingBlock).toMatchObject({
      summary: 'Thought for 27.3 seconds',
      collapsed: true,
      durationMs: 27_300,
      steps: [
        {
          type: 'thinking',
          content: 'Analyze the request and choose a concise response.',
        },
        {
          type: 'done',
          content: 'Done',
        },
      ],
    });
  });

  it('renders the tool card from the FIRST event of a turn, with no content event first', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'tool_call', toolCall: { id: 'call_1', name: 'read_file', args: {} } });

    const msg = lastAssistantMessage();
    expect(msg?.toolCalls?.[0]?.id).toBe('call_1');
    expect(msg?.toolCalls?.[0]?.status).toBe('running');
    expect(msg?.isStreaming).toBe(true);
  });

  it('renders the artifact from the FIRST event of a turn, with no content event first', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({
      type: 'artifact',
      artifact: { id: 'art_1', type: 'code', title: 'main.py', content: 'print(1)' } as never,
    });

    const msg = lastAssistantMessage();
    expect(msg?.artifacts?.[0]?.id).toBe('art_1');
  });

  it('projects a canonical agent event into assistant metadata from the first event', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({
      type: 'agent_event',
      envelope: {
        schemaVersion: 4,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence: 0,
        emittedAtMs: 1_000,
        event: { type: 'lifecycle', phase: 'started' },
      },
    });

    expect(lastAssistantMessage()?.metadata?.['agentActivity']).toMatchObject({
      turnId: 'turn-1',
      status: 'running',
      lastSequence: 0,
    });
  });

  it('settles canonical activity as failed when the transport errors', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({
      type: 'agent_event',
      envelope: {
        schemaVersion: 4,
        sessionId: 'session-1',
        turnId: 'turn-1',
        sequence: 0,
        emittedAtMs: 1_000,
        event: { type: 'lifecycle', phase: 'started' },
      },
    });
    emit({ type: 'error', error: 'Connection lost' });

    expect(lastAssistantMessage()?.metadata?.['agentActivity']).toMatchObject({ status: 'failed' });
  });
});

describe('useChat — writing style request contract', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-style',
      conversations: [
        {
          id: 'conv-style',
          title: 'Style test',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:00:00.000Z',
          executionMode: 'local_only',
        },
      ],
      messagesByConversation: { 'conv-style': [] },
      isStreaming: false,
      activeMode: null,
    } as never);
    useModelStore.setState({ models: [localModel], selectedModelId: localModel.id });
  });

  it('translates a validated style selection into a system instruction', async () => {
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-style'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
    };
    const { result } = renderHook(() => useChat(runtime));

    act(() =>
      result.current.sendMessage(
        'Draft the announcement',
        undefined,
        undefined,
        undefined,
        false,
        'formal',
      ),
    );

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-style',
      'Draft the announcement',
      expect.objectContaining({
        systemPrompt:
          'Use a formal, professional tone with precise language and complete sentences.',
      }),
    );
  });

  it('creates a visible streaming assistant placeholder before a normal Local runtime emits', async () => {
    const sendMessage = vi.fn(() => new Promise<void>(() => {}));
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-style'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'desktop',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'desktop-local-status' }));

    act(() => result.current.sendMessage('Explain this locally'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(lastAssistantMessage()).toMatchObject({
      role: 'assistant',
      content: '',
      isStreaming: true,
    });
    expect(lastAssistantMessage()?.metadata?.['agentActivity']).toBeUndefined();
  });
});

describe('useChat — stream events stay pinned to their origin conversation across a mid-turn switch', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-a',
      conversations: [
        {
          id: 'conv-a',
          title: 'Conversation A',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'local_only',
        },
        {
          id: 'conv-b',
          title: 'Conversation B',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'local_only',
        },
      ],
      messagesByConversation: { 'conv-a': [], 'conv-b': [] },
      isStreaming: false,
    } as never);
    useModelStore.setState({ models: [localModel], selectedModelId: localModel.id });
  });

  it('keeps streamed content on the conversation the turn was sent to, even after the user switches away', () => {
    let capturedCallback: StreamCallback | null = null;
    const capturedSendConvIds: string[] = [];
    const runtime: ChatRuntime = {
      sendMessage: vi.fn((conversationId: string) => {
        capturedSendConvIds.push(conversationId);
        // Never resolves -- keeps sendMessage's .finally() safety net from
        return new Promise<void>(() => {});
      }),
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-1'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      onStream: (cb: StreamCallback) => {
        capturedCallback = cb;
        return () => {
          capturedCallback = null;
        };
      },
    };
    const emit = (event: Parameters<StreamCallback>[0]) => {
      if (!capturedCallback) throw new Error('onStream callback not registered yet');
      act(() => capturedCallback!(event));
    };

    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.sendMessage('hello'));
    expect(capturedSendConvIds).toEqual(['conv-a']);

    emit({ type: 'content', content: 'Hel' });
    const convAMessages = useChatStore.getState().messagesByConversation['conv-a']!;
    expect(convAMessages).toHaveLength(2);
    const assistantId = convAMessages[1]!.id;

    act(() => {
      useChatStore.getState().setActiveConversation('conv-b');
    });

    emit({ type: 'content', content: 'lo there' });

    const convAMsg = useChatStore
      .getState()
      .messagesByConversation['conv-a']!.find((m) => m.id === assistantId);
    expect(convAMsg?.content).toBe('Hello there');
    expect(useChatStore.getState().messagesByConversation['conv-b']).toHaveLength(0);
  });

  it('stopGeneration targets the streaming conversation, not whatever is currently active', () => {
    let capturedCallback: StreamCallback | null = null;
    const stopGenerationMock = vi.fn();
    const runtime: ChatRuntime = {
      sendMessage: vi.fn(() => new Promise<void>(() => {})),
      stopGeneration: stopGenerationMock,
      createConversation: vi.fn(async () => 'conv-1'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      onStream: (cb: StreamCallback) => {
        capturedCallback = cb;
        return () => {
          capturedCallback = null;
        };
      },
    };
    const emit = (event: Parameters<StreamCallback>[0]) => {
      if (!capturedCallback) throw new Error('onStream callback not registered yet');
      act(() => capturedCallback!(event));
    };

    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.sendMessage('hello'));
    emit({ type: 'content', content: 'Hel' });

    act(() => {
      useChatStore.getState().setActiveConversation('conv-b');
    });

    act(() => result.current.stopGeneration());

    expect(stopGenerationMock).toHaveBeenCalledWith('conv-a');
  });

  it('runs and stops independent conversations in parallel when the runtime supports it', () => {
    let capturedCallback: StreamCallback | null = null;
    const sentConversationIds: string[] = [];
    const stopGenerationMock = vi.fn();
    const runtime: ChatRuntime = {
      supportsConcurrentTurns: true,
      sendMessage: vi.fn((conversationId: string) => {
        sentConversationIds.push(conversationId);
        return new Promise<void>(() => {});
      }),
      stopGeneration: stopGenerationMock,
      createConversation: vi.fn(async () => 'conv-1'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      onStream: (cb: StreamCallback) => {
        capturedCallback = cb;
        return () => {
          capturedCallback = null;
        };
      },
    };
    const emit = (event: Parameters<StreamCallback>[0]) => {
      if (!capturedCallback) throw new Error('onStream callback not registered yet');
      act(() => capturedCallback!(event));
    };

    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.sendMessage('from a'));
    expect(result.current.isStreaming).toBe(true);

    act(() => {
      useChatStore.getState().setActiveConversation('conv-b');
    });
    expect(result.current.isStreaming).toBe(false);

    act(() => result.current.sendMessage('from b'));
    expect(sentConversationIds).toEqual(['conv-a', 'conv-b']);
    expect(result.current.isStreaming).toBe(true);

    emit({ type: 'content', content: 'A reply', conversationId: 'conv-a' });
    emit({ type: 'content', content: 'B reply', conversationId: 'conv-b' });

    expect(
      useChatStore
        .getState()
        .messagesByConversation['conv-a']?.find((message) => message.role === 'assistant')?.content,
    ).toBe('A reply');
    expect(
      useChatStore
        .getState()
        .messagesByConversation['conv-b']?.find((message) => message.role === 'assistant')?.content,
    ).toBe('B reply');

    act(() => result.current.stopGeneration());
    expect(stopGenerationMock).toHaveBeenLastCalledWith('conv-b');
    expect(result.current.isStreaming).toBe(false);

    act(() => {
      useChatStore.getState().setActiveConversation('conv-a');
    });
    expect(result.current.isStreaming).toBe(true);
    act(() => result.current.stopGeneration());
    expect(stopGenerationMock).toHaveBeenLastCalledWith('conv-a');
  });
});

describe('useChat — execution-boundary model admission', () => {
  const byokModel: ModelInfo = {
    id: 'fixture-direct-model',
    name: 'Direct Provider Fixture',
    provider: 'openai',
    tier: 'standard',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128_000,
    isLocal: false,
    isByok: true,
  };

  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-local',
      conversations: [
        {
          id: 'conv-local',
          title: 'Local only',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'local_only',
        },
      ],
      messagesByConversation: { 'conv-local': [] },
      isStreaming: false,
    } as never);
    useModelStore.setState({
      models: [byokModel],
      selectedModelId: byokModel.id,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
  });

  it('rejects a stale BYOK selection before persisting or dispatching a local-only turn', () => {
    const { runtime } = makeFakeRuntime();
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'boundary-test' }));

    act(() => result.current.sendMessage('keep this local'));

    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation['conv-local']).toEqual([]);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('rejects a non-live local model before persistence or dispatch', () => {
    const unavailableLocalModel: ModelInfo = {
      ...localModel,
      availability: 'unavailable',
      unavailableReason: 'Runtime capability probe failed',
    };
    useModelStore.setState({
      models: [unavailableLocalModel],
      selectedModelId: unavailableLocalModel.id,
    });
    const { runtime } = makeFakeRuntime();
    const { result } = renderHook(() =>
      useChat(runtime, { surfaceId: 'unavailable-local-boundary-test' }),
    );

    act(() => result.current.sendMessage('keep this local'));

    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation['conv-local']).toEqual([]);
  });
});

describe('useChat — registry-backed Auto routing', () => {
  const codingPrompt = 'Implement a function and unit tests';
  const explanationPrompt = 'Explain this function';
  const codingTaskType = classifyTaskLocally(codingPrompt, []).type;
  const explanationTaskType = classifyTaskLocally(explanationPrompt, []).type;
  const autoModel: ModelInfo = {
    id: 'auto-balanced',
    name: 'Auto Balanced',
    provider: 'managed_cloud',
    tier: 'standard',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128_000,
    isLocal: false,
    isByok: false,
  };
  const webAutoDecision = requireSelectedCatalogRoute(
    {
      selection: autoModel.id,
      taskType: codingTaskType,
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    },
    'a Web managed-cloud Auto route for coding',
  );
  const desktopAutoDecision = requireSelectedCatalogRoute(
    {
      selection: autoModel.id,
      taskType: codingTaskType,
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'desktop/cloud-chat',
    },
    'a Desktop managed-cloud Auto route for coding',
  );

  function toCatalogModelInfo(
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

  const explicitWebModel = toCatalogModelInfo(
    requireRoutableCatalogModel(
      (model) => model.contextWindow !== undefined && model.capabilities.tools,
      {
        taskType: explanationTaskType,
        subscriptionTier: 'pro',
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      },
      'a live explicit Web chat model',
    ),
  );
  const explicitDesktopModel = toCatalogModelInfo(
    requireRoutableCatalogModel(
      (model) => model.contextWindow !== undefined && model.capabilities.tools,
      {
        taskType: explanationTaskType,
        subscriptionTier: 'pro',
        trustMode: 'managed_cloud',
        runtimeProfileId: 'desktop/cloud-chat',
      },
      'a live explicit Desktop managed-cloud chat model',
    ),
  );
  const explicitByokModel = toCatalogModelInfo(
    requireRoutableCatalogModel(
      (model) => model.contextWindow !== undefined && model.capabilities.tools,
      {
        taskType: explanationTaskType,
        subscriptionTier: 'byok',
        trustMode: 'byok',
        runtimeProfileId: 'desktop/byok-chat',
      },
      'a live explicit Desktop BYOK chat model',
    ),
    true,
  );

  function seedCloudConversation() {
    useChatStore.setState({
      activeConversationId: 'conv-cloud',
      conversations: [
        {
          id: 'conv-cloud',
          title: 'Managed cloud',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'cloud_managed',
        },
      ],
      messagesByConversation: { 'conv-cloud': [] },
      isStreaming: false,
    } as never);
    useModelStore.setState({
      models: [autoModel],
      selectedModelId: autoModel.id,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
    useTierStore.setState({ tier: 'pro', currentConversationProvider: null });
  }

  it('uses the registry policy and provider route for Web Auto sends', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'web-auto-policy' }));

    act(() => result.current.sendMessage(codingPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      codingPrompt,
      expect.objectContaining({
        model: webAutoDecision.modelKey,
        provider: webAutoDecision.provider,
      }),
    );
  });

  it('forwards Research only through a runtime that explicitly supports it', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
      supportsResearch: true,
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'web-research' }));

    act(() =>
      result.current.sendMessage(
        'Investigate this thoroughly',
        undefined,
        undefined,
        undefined,
        true,
      ),
    );

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Investigate this thoroughly',
      expect.objectContaining({ research: true }),
    );
  });

  it('forwards the Cloud work mode independently from permission mode', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'web-work-mode' }));

    act(() =>
      result.current.sendMessage(
        'Build and verify this',
        'auto',
        undefined,
        undefined,
        false,
        undefined,
        'agiwork',
      ),
    );

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Build and verify this',
      expect.objectContaining({ agentMode: 'auto', workMode: 'agiwork' }),
    );
    expect(lastAssistantMessage()?.metadata?.['agentActivity']).toMatchObject({
      status: 'running',
      entries: [
        expect.objectContaining({
          kind: 'progress',
          summary: 'Starting AGI Work',
          status: 'running',
        }),
      ],
    });
  });

  it('forwards an admitted skill name and marks the turn as non-regenerable', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'web-skill' }));

    act(() =>
      result.current.sendMessage(
        'Review this',
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        'fixture-reviewed-skill',
      ),
    );

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Review this',
      expect.objectContaining({ skillName: 'fixture-reviewed-skill' }),
    );
    const userMessage = useChatStore
      .getState()
      .messagesByConversation['conv-cloud']?.find((message) => message.role === 'user');
    expect(userMessage?.metadata?.['sendReplay']).toEqual({
      hasSkillInstruction: true,
      skillName: 'fixture-reviewed-skill',
    });
  });

  it('does not forward a stale Research request through an unsupported runtime', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
    };
    const { result } = renderHook(() =>
      useChat(runtime, { surfaceId: 'web-research-unsupported' }),
    );

    act(() =>
      result.current.sendMessage(
        'Investigate this thoroughly',
        undefined,
        undefined,
        undefined,
        true,
      ),
    );

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Investigate this thoroughly',
      expect.not.objectContaining({ research: true }),
    );
  });

  it('admits Desktop managed Auto through the implemented cloud profile', async () => {
    seedCloudConversation();
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'desktop',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'desktop-auto-policy' }));

    act(() => result.current.sendMessage(codingPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      codingPrompt,
      expect.objectContaining({
        model: desktopAutoDecision.modelKey,
        provider: desktopAutoDecision.provider,
      }),
    );
  });

  it('admits an explicit model through the implemented Desktop cloud profile', async () => {
    seedCloudConversation();
    useModelStore.setState({
      models: [explicitDesktopModel],
      selectedModelId: explicitDesktopModel.id,
    });
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'desktop',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'desktop-explicit-policy' }));

    act(() => result.current.sendMessage(explanationPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      explanationPrompt,
      expect.objectContaining({
        model: explicitDesktopModel.id,
        provider: explicitDesktopModel.provider,
      }),
    );
  });

  it('admits a live explicit catalog model on Web', async () => {
    seedCloudConversation();
    useModelStore.setState({ models: [explicitWebModel], selectedModelId: explicitWebModel.id });
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-cloud'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'web',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'web-explicit-policy' }));

    act(() => result.current.sendMessage(explanationPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      explanationPrompt,
      expect.objectContaining({
        model: explicitWebModel.id,
        provider: explicitWebModel.provider,
      }),
    );
  });

  it('admits a canonical explicit model through the Desktop BYOK registry profile', async () => {
    useChatStore.setState({
      activeConversationId: 'conv-byok',
      conversations: [
        {
          id: 'conv-byok',
          title: 'Direct provider',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'byok',
        },
      ],
      messagesByConversation: { 'conv-byok': [] },
      isStreaming: false,
    } as never);
    useModelStore.setState({
      models: [explicitByokModel],
      selectedModelId: explicitByokModel.id,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-byok'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'desktop',
    };
    const { result } = renderHook(() => useChat(runtime, { surfaceId: 'desktop-byok-policy' }));

    act(() => result.current.sendMessage(explanationPrompt));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-byok',
      explanationPrompt,
      expect.objectContaining({
        model: explicitByokModel.id,
        provider: explicitByokModel.provider,
      }),
    );
  });

  it('keeps a host-discovered BYOK model usable when it is intentionally absent from the static registry', async () => {
    const dynamicByokModel: ModelInfo = {
      ...explicitByokModel,
      id: 'fixture-private-gateway-model',
      name: 'Private Gateway Model Fixture',
      provider: 'fixture_private_gateway',
      isByok: true,
    };
    useChatStore.setState({
      activeConversationId: 'conv-byok',
      conversations: [
        {
          id: 'conv-byok',
          title: 'Direct provider',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
          pinned: false,
          executionMode: 'byok',
        },
      ],
      messagesByConversation: { 'conv-byok': [] },
      isStreaming: false,
    } as never);
    useModelStore.setState({
      models: [dynamicByokModel],
      selectedModelId: dynamicByokModel.id,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
    const sendMessage = vi.fn(async () => {});
    const runtime: ChatRuntime = {
      sendMessage,
      stopGeneration: vi.fn(),
      createConversation: vi.fn(async () => 'conv-byok'),
      deleteConversation: vi.fn(async () => {}),
      renameConversation: vi.fn(async () => {}),
      getPlatform: () => 'desktop',
    };
    const { result } = renderHook(() =>
      useChat(runtime, { surfaceId: 'desktop-dynamic-byok-policy' }),
    );

    act(() => result.current.sendMessage('Explain this function'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-byok',
      'Explain this function',
      expect.objectContaining({
        model: dynamicByokModel.id,
        provider: dynamicByokModel.provider,
      }),
    );
  });
});
