import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';

const RUN_ID = '0190a000-0000-7000-8000-000000000099';
const RUN_PATH = `/api/llm/v1/chat/completions/runs/${RUN_ID}`;

function makeRuntime(overrides: Partial<ChatRuntime> = {}) {
  const reattachConversation = vi.fn(async () => {});
  const runtime: ChatRuntime = {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    reattachConversation,
    onStream: (_next: StreamCallback) => () => {},
    ...overrides,
  };
  return { runtime, reattachConversation };
}

function seedAssistantMessage(metadata: Record<string, unknown>): void {
  useChatStore.setState({
    activeConversationId: 'conv-1',
    messagesByConversation: {
      'conv-1': [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Working on it.',
          model: 'claude-opus-5',
          metadata,
        },
      ],
    },
    isStreaming: false,
  } as never);
}

const openRun = {
  runId: RUN_ID,
  runPath: RUN_PATH,
  lastSequence: 12,
};

beforeEach(() => {
  useChatStore.setState({
    activeConversationId: 'conv-1',
    messagesByConversation: { 'conv-1': [] },
    isStreaming: false,
  } as never);
});

describe('useChat durable-run reattachment', () => {
  it('rejoins a run whose turn was saved by the server while the app was closed', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'running' } });

    renderHook(() => useChat(runtime));

    await waitFor(() =>
      expect(reattachConversation).toHaveBeenCalledWith('conv-1', {
        assistantMessageId: 'assistant-1',
        model: 'claude-opus-5',
        content: 'Working on it.',
        runReference: openRun,
        hasPersistedApproval: false,
      }),
    );
  });

  it('does not call the server about a run that already reached a terminal state', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'ready_for_review' } });

    renderHook(() => useChat(runtime));

    await Promise.resolve();
    expect(reattachConversation).not.toHaveBeenCalled();
  });

  it('does not reattach a turn a client already watched finish', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    // A recorded finishReason means some client saw this turn end.
    seedAssistantMessage({ cloudAgentRun: openRun, finishReason: 'stop' });

    renderHook(() => useChat(runtime));

    await Promise.resolve();
    expect(reattachConversation).not.toHaveBeenCalled();
  });

  it('tells the runtime when the stored turn already carries its approval card', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    seedAssistantMessage({
      cloudAgentRun: { ...openRun, state: 'awaiting_input' },
      cloudApproval: { schemaVersion: 1, runId: RUN_ID, calls: [] },
    });

    renderHook(() => useChat(runtime));

    await waitFor(() =>
      expect(reattachConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ hasPersistedApproval: true }),
      ),
    );
  });

  it('ignores a conversation with no durable run reference at all', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    seedAssistantMessage({});

    renderHook(() => useChat(runtime));

    await Promise.resolve();
    expect(reattachConversation).not.toHaveBeenCalled();
  });

  it('keeps the transcript intact when the run cannot be rejoined', async () => {
    const reattachConversation = vi.fn(async () => {
      throw new Error('offline');
    });
    const { runtime } = makeRuntime({ reattachConversation });
    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'running' } });

    renderHook(() => useChat(runtime));

    await waitFor(() => expect(reattachConversation).toHaveBeenCalled());
    const messages = useChatStore.getState().messagesByConversation['conv-1'];
    expect(messages?.[0]?.content).toBe('Working on it.');
    expect(messages?.[0]?.error).toBeUndefined();
  });

  it('still reattaches when the transcript loads after the conversation is selected', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    // Conversation selected first, messages fetched afterwards — the ordering a
    // real app produces, and the one a conversation-keyed effect would miss.
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: {},
      isStreaming: false,
    } as never);

    const { rerender } = renderHook(() => useChat(runtime));
    expect(reattachConversation).not.toHaveBeenCalled();

    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'running' } });
    rerender();

    await waitFor(() => expect(reattachConversation).toHaveBeenCalledTimes(1));
  });

  it('attempts a given turn only once, not on every re-render', async () => {
    const { runtime, reattachConversation } = makeRuntime();
    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'running' } });

    const { rerender } = renderHook(() => useChat(runtime));
    await waitFor(() => expect(reattachConversation).toHaveBeenCalledTimes(1));

    rerender();
    rerender();
    expect(reattachConversation).toHaveBeenCalledTimes(1);
  });

  it('is optional: a runtime without durable runs is never asked to reattach', async () => {
    const { runtime } = makeRuntime();
    const localRuntime: ChatRuntime = { ...runtime };
    delete localRuntime.reattachConversation;
    seedAssistantMessage({ cloudAgentRun: { ...openRun, state: 'running' } });

    expect(() => renderHook(() => useChat(localRuntime))).not.toThrow();
  });
});
