import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStreamErrorNotice } from '../../lib/continue-generation';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';
import { useChatStore } from '../../stores/chatStore';
import { useChat } from '../useChat';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

function makeRuntime() {
  let callback: StreamCallback | null = null;
  const runtime: ChatRuntime = {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    onStream: (cb: StreamCallback) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
  };
  return {
    runtime,
    emit: (event: Parameters<StreamCallback>[0]) => {
      if (!callback) throw new Error('onStream callback not registered yet');
      act(() => callback!(event));
    },
  };
}

function assistantTurn() {
  return useChatStore
    .getState()
    .messagesByConversation['conv-1']?.find((message) => message.role === 'assistant');
}

describe('useChat, a failed reply is reported once', () => {
  beforeEach(() => {
    toastError.mockClear();
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: { 'conv-1': [] },
      isStreaming: false,
    } as never);
  });

  it('puts the failure in the turn and raises no toast that repeats it', () => {
    const { runtime, emit } = makeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'content', content: 'Partial answer' });
    emit({ type: 'error', error: 'The provider stopped responding.' });

    expect(getStreamErrorNotice(assistantTurn())).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still raises a toast when no turn exists to carry the failure', () => {
    const { runtime, emit } = makeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'error', error: 'The provider stopped responding.' });

    expect(assistantTurn()).toBeUndefined();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
