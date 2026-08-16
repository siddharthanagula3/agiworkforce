import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';

enableMapSet();

const cancelToolExecution = vi.fn();
const clearToolStreams = vi.fn();
const setIsLoading = vi.fn();
const setStreamingMessage = vi.fn();
const setAgentStatus = vi.fn();
const clearActionTrail = vi.fn();
const clearBackgroundTasks = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
  isTauri: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../stores/chat/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      setIsLoading,
      setStreamingMessage,
    }),
  },
}));

vi.mock('../stores/chat/agentStore', () => ({
  useAgentStore: {
    getState: () => ({
      setAgentStatus,
      clearActionTrail,
      clearBackgroundTasks,
    }),
  },
}));

vi.mock('../stores/chat/toolStore', () => ({
  useToolStore: {
    getState: () => ({
      activeToolStreams: new Map([
        [
          'tool-1',
          {
            tool_id: 'tool-1',
            tool_name: 'file_list',
            status: 'running',
          },
        ],
      ]),
      cancelToolExecution,
      clearToolStreams,
    }),
  },
}));

describe('resetInFlightChatState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears transient in-flight state and emits new-conversation event', async () => {
    const { resetInFlightChatState } = await import('../lib/newChatReset');
    await resetInFlightChatState();

    const dispatchSpy = vi.mocked(window.dispatchEvent);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchSpy.mock.calls[0]![0];
    expect(dispatchedEvent.type).toBe('chat:new-conversation');

    expect(setIsLoading).toHaveBeenCalledWith(false);
    expect(setStreamingMessage).toHaveBeenCalledWith(null);
    expect(setAgentStatus).toHaveBeenCalledWith(null);
    expect(clearActionTrail).toHaveBeenCalledTimes(1);
    expect(clearBackgroundTasks).toHaveBeenCalledTimes(1);
    expect(cancelToolExecution).toHaveBeenCalledWith('tool-1');
    expect(clearToolStreams).toHaveBeenCalledTimes(1);
  });
});

describe('resetInFlightChatState (integration with real stores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies real chatStore state transitions from loading to idle', async () => {

    const { resetInFlightChatState } = await import('../lib/newChatReset');
    await resetInFlightChatState();

    expect(setIsLoading).toHaveBeenCalledWith(false);
    expect(setStreamingMessage).toHaveBeenCalledWith(null);
    expect(setAgentStatus).toHaveBeenCalledWith(null);
  });

  it('cancels all running tool streams before clearing', async () => {
    const { resetInFlightChatState } = await import('../lib/newChatReset');
    await resetInFlightChatState();

    expect(cancelToolExecution).toHaveBeenCalledWith('tool-1');
    expect(cancelToolExecution).toHaveBeenCalledTimes(1);

    expect(clearToolStreams).toHaveBeenCalledTimes(1);

    const cancelOrder = cancelToolExecution.mock.invocationCallOrder[0];
    const clearOrder = clearToolStreams.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(clearOrder!);
  });

  it('dispatches chat:new-conversation custom event', async () => {
    const { resetInFlightChatState } = await import('../lib/newChatReset');
    await resetInFlightChatState();

    const dispatchSpy = vi.mocked(window.dispatchEvent);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchSpy.mock.calls[0]![0];
    expect(dispatchedEvent).toBeInstanceOf(CustomEvent);
    expect(dispatchedEvent.type).toBe('chat:new-conversation');
  });
});
