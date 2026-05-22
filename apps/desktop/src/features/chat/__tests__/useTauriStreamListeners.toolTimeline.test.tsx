import type React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { enableMapSet } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listenMock, invokeMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  isTauri: true,
  listen: listenMock,
  invoke: invokeMock,
}));

import { useTauriStreamListeners } from '../useTauriStreamListeners';
import { useAgentStore } from '../../../stores/chat/agentStore';
import { useChatStore } from '../../../stores/chat/chatStore';
import { useToolStore } from '../../../stores/chat/toolStore';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';

type ListenerCallback<T> = (event: { payload: T }) => void;

enableMapSet();

function createHookConfig(messageId: string) {
  return {
    abortControllerRef: { current: null } as React.MutableRefObject<AbortController | null>,
    unlistenFnsRef: { current: [] } as React.MutableRefObject<Array<() => void | Promise<void>>>,
    listenerSetupGenerationRef: { current: 0 } as React.MutableRefObject<number>,
    isMountedRef: { current: true } as React.MutableRefObject<boolean>,
    toolExecutionTimeoutsRef: {
      current: new Map(),
    } as React.MutableRefObject<
      Map<
        string,
        {
          conversationId: number;
          softTimeoutId: ReturnType<typeof setTimeout>;
          hardTimeoutId: ReturnType<typeof setTimeout>;
        }
      >
    >,
    activeStreamSessionsRef: {
      current: new Map([[42, messageId]]),
    } as React.MutableRefObject<Map<number, string>>,
    streamWatchdogTimeoutRef: {
      current: null,
    } as React.MutableRefObject<NodeJS.Timeout | null>,
    rafIdRef: { current: null } as React.MutableRefObject<number | null>,
    queueStreamUpdate: vi.fn(),
    clearQueuedStreamUpdates: vi.fn(),
    markStreamActivity: vi.fn(),
  };
}

describe('useTauriStreamListeners tool timeline', () => {
  beforeEach(() => {
    listenMock.mockReset();
    invokeMock.mockReset();
    useUnifiedChatStore.getState().resetOnLogout();
    useChatStore.getState().resetOnLogout();
    useAgentStore.getState().resetOnLogout();
    useToolStore.getState().resetOnLogout();
  });

  afterEach(() => {
    useUnifiedChatStore.getState().resetOnLogout();
    useChatStore.getState().resetOnLogout();
    useAgentStore.getState().resetOnLogout();
    useToolStore.getState().resetOnLogout();
  });

  it('writes chat tool events into the per-message tool timeline', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    useChatStore.getState().createConversation('Browser tool timeline');
    const messageId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working...',
    });
    useChatStore.getState().setStreamingMessage(messageId);

    renderHook(() => useTauriStreamListeners(createHookConfig(messageId)));

    await waitFor(() => {
      expect(listeners.has('chat:tool-calls')).toBe(true);
      expect(listeners.has('chat:tool-result')).toBe(true);
    });

    act(() => {
      listeners.get('chat:tool-calls')?.({
        payload: {
          conversation_id: 42,
          message_id: messageId,
          tool_calls: [
            {
              index: 0,
              id: 'tool-1',
              name: 'browser_navigate',
              arguments: JSON.stringify({ url: 'https://example.com' }),
            },
          ],
          streaming: true,
        },
      });
    });

    let entry = useChatStore.getState().toolTimelineByMessage[messageId]?.[0];
    expect(entry?.displayArgs).toBe('https://example.com');
    expect(entry?.status).toBe('running');

    act(() => {
      listeners.get('chat:tool-result')?.({
        payload: {
          conversation_id: 42,
          message_id: messageId,
          tool_call_id: 'tool-1',
          tool_name: 'browser_navigate',
          success: true,
          result: 'ok',
        },
      });
    });

    entry = useChatStore.getState().toolTimelineByMessage[messageId]?.[0];
    expect(entry?.status).toBe('completed');
  });

  it('routes thinking events to the streaming transcript message when the session map is empty', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    useChatStore.getState().createConversation('Thinking target fallback');
    const messageId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working...',
    });
    useChatStore.getState().setStreamingMessage(messageId);

    const config = createHookConfig(messageId);
    config.activeStreamSessionsRef.current = new Map();

    renderHook(() => useTauriStreamListeners(config));

    await waitFor(() => {
      expect(listeners.has('thinking:event')).toBe(true);
    });

    act(() => {
      listeners.get('thinking:event')?.({
        payload: {
          event_type: 'delta',
          content: 'Planning next step',
          timestamp: Date.now(),
        },
      });
    });

    expect(useChatStore.getState().thinkingByMessage[messageId]).toBe('Planning next step');
  });

  it('records mode-blocked tools in the visible activity stores', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    useChatStore.getState().createConversation('Blocked tool');
    const messageId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working...',
    });
    useChatStore.getState().setStreamingMessage(messageId);

    renderHook(() => useTauriStreamListeners(createHookConfig(messageId)));

    await waitFor(() => {
      expect(listeners.has('tool:blocked_by_mode')).toBe(true);
    });

    act(() => {
      listeners.get('tool:blocked_by_mode')?.({
        payload: {
          tool_name: 'browser_click',
          mode: 'Safe',
          hint: 'Switch to Build mode to interact with the browser.',
        },
      });
    });

    expect(useAgentStore.getState().actionTrail[0]).toMatchObject({
      type: 'error',
      message:
        'browser_click is blocked in Safe mode. Switch to Build mode to interact with the browser.',
      metadata: {
        messageId,
        toolName: 'browser_click',
        mode: 'Safe',
      },
    });
    expect(useToolStore.getState().actionLog[0]).toMatchObject({
      type: 'approval',
      title: 'Tool blocked by mode',
      status: 'failed',
      error:
        'browser_click is blocked in Safe mode. Switch to Build mode to interact with the browser.',
      metadata: {
        messageId,
        toolName: 'browser_click',
        mode: 'Safe',
      },
    });
  });

  it('routes tool progress to the event conversation instead of the global streaming message', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    useChatStore.getState().createConversation('Tool progress overlap');
    const firstMessageId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working on first...',
    });
    const secondMessageId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working on second...',
    });
    useChatStore.getState().setStreamingMessage(secondMessageId);

    const config = createHookConfig(firstMessageId);
    config.activeStreamSessionsRef.current = new Map([
      [42, firstMessageId],
      [43, secondMessageId],
    ]);

    renderHook(() => useTauriStreamListeners(config));

    await waitFor(() => {
      expect(listeners.has('chat:tool-progress')).toBe(true);
    });

    act(() => {
      listeners.get('chat:tool-progress')?.({
        payload: {
          conversation_id: 42,
          tool_name: 'generate_image',
          status: 'processing_result',
          message: 'Rendering image...',
        },
      });
    });

    const state = useChatStore.getState();
    const firstMessage = state.messages.find((message) => message.id === firstMessageId);
    const secondMessage = state.messages.find((message) => message.id === secondMessageId);

    expect(firstMessage?.metadata?.label).toBe('Rendering image...');
    expect(firstMessage?.metadata?.status).toBe('tool_progress');
    expect(secondMessage?.metadata?.label).toBeUndefined();
  });
});
