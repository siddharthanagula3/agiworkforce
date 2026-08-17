import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';

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

function assistantMessages() {
  return (useChatStore.getState().messagesByConversation['conv-1'] ?? []).filter(
    (m) => m.role === 'assistant',
  );
}

describe('useChat — deep research status arriving before any content', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: { 'conv-1': [] },
      isStreaming: false,
    } as never);
  });

  it('creates the assistant placeholder so the planning phase is not dropped', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'research_status', status: { phase: 'planning', label: 'Planning research' } });

    const messages = assistantMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.metadata?.['research']).toEqual({
      phase: 'planning',
      label: 'Planning research',
    });
  });

  it('updates the same message on later phases instead of forking a new one', () => {
    const { runtime, emit } = makeFakeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'research_status', status: { phase: 'planning' } });
    emit({ type: 'research_status', status: { phase: 'searching', searches: 3, sources: 9 } });
    emit({ type: 'content', content: 'Report body' });

    const messages = assistantMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Report body');
    expect(messages[0]?.metadata?.['research']).toEqual({
      phase: 'searching',
      searches: 3,
      sources: 9,
    });
  });
});
