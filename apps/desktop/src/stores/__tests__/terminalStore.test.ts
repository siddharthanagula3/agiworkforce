import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useTerminalStore } from '../terminalStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const listeners: Record<string, (event: { payload: string }) => void> = {};
const unlistenSpies: Mock[] = [];

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (event: { payload: string }) => void) => {
    listeners[event] = handler;
    const unlisten = vi.fn(() => {
      delete listeners[event];
    });
    unlistenSpies.push(unlisten);
    return Promise.resolve(unlisten as unknown as () => void);
  }),
}));

const sessionId = 'session-123';

beforeEach(() => {
  useTerminalStore.getState().reset();
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  unlistenSpies.splice(0, unlistenSpies.length);
});

describe('useTerminalStore setupOutputListener', () => {
  it('registers output & exit listeners and removes session on exit', async () => {
    useTerminalStore.setState((state) => ({
      ...state,
      sessions: [
        {
          id: sessionId,
          shellType: 'PowerShell',
          title: 'PowerShell',
          active: true,
          createdAt: Date.now(),
        },
      ],
      activeSessionId: sessionId,
    }));

    const outputSpy = vi.fn();
    const exitSpy = vi.fn();

    await useTerminalStore.getState().setupOutputListener(sessionId, outputSpy, exitSpy);

    const { listen } = await import('@tauri-apps/api/event');
    const listenMock = listen as unknown as Mock;
    expect(listenMock).toHaveBeenCalledWith(`terminal-output-${sessionId}`, expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith(`terminal-exit-${sessionId}`, expect.any(Function));

    listeners[`terminal-output-${sessionId}`]?.({ payload: 'hello' });
    expect(outputSpy).toHaveBeenCalledWith('hello');

    listeners[`terminal-exit-${sessionId}`]?.({ payload: '' });
    unlistenSpies.forEach((fn) => expect(fn).toHaveBeenCalled());
    expect(exitSpy).toHaveBeenCalled();

    const state = useTerminalStore.getState();
    expect(state.sessions).toHaveLength(0);
    expect(state.activeSessionId).toBeNull();
    expect(state.listeners.size).toBe(0);
  });
});
