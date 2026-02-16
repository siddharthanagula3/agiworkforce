import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelToolExecution = vi.fn();
const clearToolStreams = vi.fn();
const setIsLoading = vi.fn();
const setStreamingMessage = vi.fn();
const setAgentStatus = vi.fn();
const clearActionTrail = vi.fn();
const clearBackgroundTasks = vi.fn();

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
  isTauri: vi.fn(() => Promise.resolve(false)),
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
    const eventSpy = vi.fn();
    window.addEventListener('chat:new-conversation', eventSpy);

    const { resetInFlightChatState } = await import('../lib/newChatReset');
    await resetInFlightChatState();

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(setIsLoading).toHaveBeenCalledWith(false);
    expect(setStreamingMessage).toHaveBeenCalledWith(null);
    expect(setAgentStatus).toHaveBeenCalledWith(null);
    expect(clearActionTrail).toHaveBeenCalledTimes(1);
    expect(clearBackgroundTasks).toHaveBeenCalledTimes(1);
    expect(cancelToolExecution).toHaveBeenCalledWith('tool-1');
    expect(clearToolStreams).toHaveBeenCalledTimes(1);

    window.removeEventListener('chat:new-conversation', eventSpy);
  });
});
