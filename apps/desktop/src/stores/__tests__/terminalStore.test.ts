import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useTerminalStore } from '../terminalStore';

// AUDIT-P3-TEST-TYPE: Properly typed event listeners for terminal events
type TerminalEventPayload = { payload: string };
const listeners: Record<string, (event: TerminalEventPayload) => void> = {};
const unlistenSpies: Mock<() => void>[] = [];

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn((event: string, handler: (event: TerminalEventPayload) => void) => {
    listeners[event] = handler;
    const unlisten = vi.fn<() => void>(() => {
      delete listeners[event];
    });
    unlistenSpies.push(unlisten);
    // AUDIT-P3-TEST-TYPE: Return unlisten function with proper type
    return Promise.resolve(unlisten);
  }),
  isTauri: true,
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

    const { listen } = await import('../../lib/tauri-mock');
    // AUDIT-P3-TEST-TYPE: Use proper mock type for listen function
    const listenMock = listen as Mock<typeof listen>;
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
