/**
 * useChat — a transport-level error (StreamEvent 'error', e.g. a
 * tool-approval resume that failed outright over the "bare {type:'error'}"
 * path desktop's WebRuntime/CloudRuntime.resolveToolApproval use) must not
 * leave a tool call optimistically patched to 'running' stuck there forever
 * (streaming/approval cluster Finding 3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useTierStore } from '../../stores/tierStore';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';
import type { ModelInfo } from '../../lib/types';

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

    // Seed the assistant message via a 'content' event first (addMsg's
    // "create new message" path only forwards {id,role,content,timestamp} to
    // the store -- a separate, pre-existing gap where toolCalls/isStreaming/
    // etc passed alongside a FIRST tool_call event would be silently
    // dropped; using the 'else' (existing-message) branch here tests
    // Finding 3 in isolation without tripping over that unrelated one).
    emit({ type: 'content', content: '' });
    // A tool call starts running (e.g. just approved via resolveToolApproval).
    emit({ type: 'tool_call', toolCall: { id: 'call_1', name: 'read_file', args: {} } });
    expect(lastAssistantMessage()?.toolCalls?.[0]?.status).toBe('running');

    // The resume itself fails outright (WebRuntime/CloudRuntime's bare
    // {type:'error'} path) before any tool_result ever arrives.
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

    // No tool_call event fired first -- nothing to patch, must not throw.
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

  it('renders the tool card from the FIRST event of a turn, with no content event first', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    // Previously addMsg's create-path only forwarded {id,role,content,timestamp}
    // to the store, so a turn that starts with tool_call (no prior content
    // event) rendered a bare empty bubble -- toolCalls was silently dropped
    // until a SECOND event for the same message arrived.
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
        // firing mid-test and calling stopStreaming() out from under us.
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

    // User sends from conv-a.
    act(() => result.current.sendMessage('hello'));
    expect(capturedSendConvIds).toEqual(['conv-a']);

    // First content chunk arrives while conv-a is still active -- creates
    // the assistant message there.
    emit({ type: 'content', content: 'Hel' });
    const convAMessages = useChatStore.getState().messagesByConversation['conv-a']!;
    expect(convAMessages).toHaveLength(2); // user message + assistant message
    const assistantId = convAMessages[1]!.id;

    // Nothing in the sidebar gates conversation switching on isStreaming --
    // the user navigates away WHILE conv-a's turn is still in flight.
    act(() => {
      useChatStore.getState().setActiveConversation('conv-b');
    });

    // More content for conv-a's turn arrives after the switch.
    emit({ type: 'content', content: 'lo there' });

    const convAMsg = useChatStore
      .getState()
      .messagesByConversation['conv-a']!.find((m) => m.id === assistantId);
    expect(convAMsg?.content).toBe('Hello there');
    // And it must not leak into the conversation the user switched to.
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
});

describe('useChat — execution-boundary model admission', () => {
  const byokModel: ModelInfo = {
    id: 'gpt-direct',
    name: 'GPT Direct',
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
  const routedModel: ModelInfo = {
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
      models: [autoModel, routedModel],
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

    act(() => result.current.sendMessage('Implement a function and unit tests'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Implement a function and unit tests',
      expect.objectContaining({ model: 'claude-sonnet-5', provider: 'anthropic' }),
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

    act(() => result.current.sendMessage('Investigate this thoroughly', undefined, undefined, undefined, true));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Investigate this thoroughly',
      expect.objectContaining({ research: true }),
    );
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

    act(() => result.current.sendMessage('Investigate this thoroughly', undefined, undefined, undefined, true));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Investigate this thoroughly',
      expect.not.objectContaining({ research: true }),
    );
  });

  it('fails closed before persistence when Desktop managed Auto is not wired', () => {
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

    act(() => result.current.sendMessage('Implement a function and unit tests'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation['conv-cloud']).toEqual([]);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('fails closed for an explicit model when the Desktop managed profile is unwired', () => {
    seedCloudConversation();
    useModelStore.setState({ selectedModelId: routedModel.id });
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

    act(() => result.current.sendMessage('Explain this function'));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation['conv-cloud']).toEqual([]);
  });

  it('admits a GA explicit model on Web', async () => {
    seedCloudConversation();
    const unavailableModel: ModelInfo = {
      ...routedModel,
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      provider: 'openai',
    };
    useModelStore.setState({ models: [unavailableModel], selectedModelId: unavailableModel.id });
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

    act(() => result.current.sendMessage('Explain this function'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-cloud',
      'Explain this function',
      expect.objectContaining({ model: 'gpt-5.6-sol', provider: 'openai' }),
    );
  });

  it('admits a canonical explicit model through the Desktop BYOK registry profile', async () => {
    const byokModel: ModelInfo = { ...routedModel, isByok: true };
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
      models: [byokModel],
      selectedModelId: byokModel.id,
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

    act(() => result.current.sendMessage('Explain this function'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-byok',
      'Explain this function',
      expect.objectContaining({ model: 'claude-sonnet-5', provider: 'anthropic' }),
    );
  });

  it('keeps a host-discovered BYOK model usable when it is intentionally absent from the static registry', async () => {
    const dynamicByokModel: ModelInfo = {
      ...routedModel,
      id: 'private-gateway/custom-model',
      name: 'Private Gateway Model',
      provider: 'private_gateway',
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
