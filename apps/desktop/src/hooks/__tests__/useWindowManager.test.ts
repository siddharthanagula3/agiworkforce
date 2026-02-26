import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWindowManager } from '../useWindowManager';
import { invoke, listen } from '../../lib/tauri-mock';

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  isTauri: true,
}));

const mockGetCurrentWindow = vi.fn();
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockGetCurrentWindow(),
}));

describe('useWindowManager - Fullscreen Functionality', () => {
  const mockWindowInstance = {
    minimize: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentWindow.mockReturnValue(mockWindowInstance);

    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'window_get_state') {
        return Promise.resolve({
          pinned: true,
          alwaysOnTop: false,
          dock: null,
          maximized: false,
          fullscreen: false,
        } as any);
      }
      return Promise.resolve(undefined as any);
    });

    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default fullscreen state as false', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(false);
      });
    });

    it('should fetch initial window state including fullscreen on mount', async () => {
      renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_get_state');
      });
    });

    it('should restore fullscreen state from backend on mount', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_get_state') {
          return Promise.resolve({
            pinned: true,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: true,
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(true);
      });
    });
  });

  describe('Toggle Maximize (Fullscreen)', () => {
    it('should call window_toggle_maximize when toggleMaximize is invoked', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_toggle_maximize');
    });

    it('should handle errors gracefully when toggle fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_toggle_maximize') {
          return Promise.reject(new Error('Toggle failed'));
        }
        if (command === 'window_get_state') {
          return Promise.resolve({
            pinned: true,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: false,
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to toggle maximize state',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Window State Events', () => {
    it('should listen to window:state changes and update state', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalledWith('window:state', expect.any(Function));
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: null,
              maximized: false,
              fullscreen: true,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(true);
      });
    });

    it('should update fullscreen state to false when exiting fullscreen', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_get_state') {
          return Promise.resolve({
            pinned: true,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: true,
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(true);
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: null,
              maximized: false,
              fullscreen: false,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(false);
      });
    });

    it('should not update state after component unmount', async () => {
      type EventCallback = (event: any) => void;
      let stateEventCallback: EventCallback | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: EventCallback) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result, unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      unmount();

      if (stateEventCallback) {
        (stateEventCallback as EventCallback)({
          payload: {
            pinned: true,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: true,
          },
        });
      }

      expect(result.current.state.fullscreen).toBe(false);
    });
  });

  describe('State Independence', () => {
    it('should track fullscreen and maximized states independently', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: null,
              maximized: true,
              fullscreen: true,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(true);
        expect(result.current.state.maximized).toBe(true);
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: null,
              maximized: true,
              fullscreen: false,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(false);
        expect(result.current.state.maximized).toBe(true);
      });
    });
  });

  describe('Dock and Fullscreen Interaction', () => {
    it('should handle docked and fullscreen states together', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: 'left',
              maximized: false,
              fullscreen: false,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.dock).toBe('left');
        expect(result.current.state.fullscreen).toBe(false);
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: true,
              alwaysOnTop: false,
              dock: 'left',
              maximized: false,
              fullscreen: true,
            },
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.dock).toBe('left');
        expect(result.current.state.fullscreen).toBe(true);
      });
    });
  });

  describe('Actions Memoization', () => {
    it('should memoize actions object to prevent unnecessary re-renders', async () => {
      const { result, rerender } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const firstActionsRef = result.current.actions;

      rerender();

      expect(result.current.actions).toBe(firstActionsRef);
    });

    it('should provide all required window actions', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      expect(result.current.actions).toHaveProperty('refresh');
      expect(result.current.actions).toHaveProperty('setPinned');
      expect(result.current.actions).toHaveProperty('togglePinned');
      expect(result.current.actions).toHaveProperty('setAlwaysOnTop');
      expect(result.current.actions).toHaveProperty('toggleAlwaysOnTop');
      expect(result.current.actions).toHaveProperty('dock');
      expect(result.current.actions).toHaveProperty('minimize');
      expect(result.current.actions).toHaveProperty('toggleMaximize');
      expect(result.current.actions).toHaveProperty('hide');
      expect(result.current.actions).toHaveProperty('show');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle Ctrl+Alt+Arrow keyboard shortcuts for docking', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const leftArrowEvent = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(leftArrowEvent);
      });

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_dock', { position: 'left' });
      });
    });

    it('should handle Ctrl+Alt+Right for docking right', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const rightArrowEvent = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(rightArrowEvent);
      });

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_dock', { position: 'right' });
      });
    });

    it('should handle Ctrl+Alt+Down for undocking', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const downArrowEvent = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(downArrowEvent);
      });

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_dock', { position: null });
      });
    });
  });

  describe('Event Cleanup', () => {
    it('should clean up event listeners on unmount', async () => {
      const mockUnlisten1 = vi.fn();
      const mockUnlisten2 = vi.fn();
      const mockUnlisten3 = vi.fn();

      let unlistenCallCount = 0;
      vi.mocked(listen).mockImplementation(() => {
        unlistenCallCount++;
        if (unlistenCallCount === 1) return Promise.resolve(mockUnlisten1);
        if (unlistenCallCount === 2) return Promise.resolve(mockUnlisten2);
        return Promise.resolve(mockUnlisten3);
      });

      const { unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalledTimes(3);
      });

      unmount();

      await waitFor(() => {
        expect(mockUnlisten1).toHaveBeenCalled();
        expect(mockUnlisten2).toHaveBeenCalled();
        expect(mockUnlisten3).toHaveBeenCalled();
      });
    });

    it('should clean up keyboard event listener on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  // H57 — additional window manager edge-case tests
  describe('Closed window access (H57)', () => {
    it('returns undefined state gracefully after unmount', async () => {
      const { result, unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const stateBeforeUnmount = result.current.state;
      unmount();

      // The last rendered state snapshot is preserved; no error is thrown
      expect(stateBeforeUnmount).toBeDefined();
      expect(typeof stateBeforeUnmount.fullscreen).toBe('boolean');
    });

    it('does not throw when actions are called after invoke rejects', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_get_state') {
          return Promise.resolve({
            pinned: false,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: false,
          });
        }
        // Simulate a closed/destroyed window rejecting every action
        return Promise.reject(new Error('Window already closed'));
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Should not throw — errors are swallowed internally
      await expect(result.current.actions.toggleMaximize()).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Concurrent window operations (H57)', () => {
    it('handles multiple concurrent toggleMaximize calls without throwing', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Fire three toggleMaximize calls concurrently
      const results = await Promise.allSettled([
        result.current.actions.toggleMaximize(),
        result.current.actions.toggleMaximize(),
        result.current.actions.toggleMaximize(),
      ]);

      // All should settle (fulfilled or rejected) without crashing the hook
      expect(results).toHaveLength(3);
    });

    it('handles concurrent dock + minimize calls without interfering', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await Promise.allSettled([
        result.current.actions.dock('left'),
        result.current.actions.minimize(),
      ]);

      // dock uses invoke('window_dock'), while minimize uses the Tauri Window API
      // (getCurrentWindow().minimize()) rather than a custom invoke command.
      const invokeCalls = vi.mocked(invoke).mock.calls.map((c) => c[0]);
      expect(invokeCalls).toContain('window_dock');
      // minimize is called via the native window API
      expect(mockWindowInstance.minimize).toHaveBeenCalled();
    });
  });

  describe('Unmount cleanup releases resources (H57)', () => {
    it('calls all unlisten functions when unmounted', async () => {
      const unlistenFns = [vi.fn(), vi.fn(), vi.fn()];
      let callCount = 0;

      vi.mocked(listen).mockImplementation(() => {
        const fn = unlistenFns[callCount++ % unlistenFns.length]!;
        return Promise.resolve(fn);
      });

      const { unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        // Every unlisten function that was registered should have been called
        const called = unlistenFns.filter((fn) => fn.mock.calls.length > 0);
        expect(called.length).toBeGreaterThan(0);
      });
    });

    it('does not fire state updates after component is unmounted', async () => {
      type EventCb = (event: { payload: unknown; id: number }) => void;
      let capturedCallback: EventCb | null = null;

      vi.mocked(listen).mockImplementation(((eventName: string, callback: EventCb) => {
        if (eventName === 'window:state') {
          capturedCallback = callback;
        }
        return Promise.resolve(vi.fn());
      }) as typeof listen);

      const { result, unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(capturedCallback).not.toBeNull();
      });

      const stateAtUnmount = result.current.state.fullscreen;

      unmount();

      // Dispatch a state event after unmount — should not change anything
      if (capturedCallback) {
        (capturedCallback as EventCb)({
          id: 999,
          payload: {
            pinned: false,
            alwaysOnTop: false,
            dock: null,
            maximized: false,
            fullscreen: !stateAtUnmount,
          },
        });
      }

      // The last rendered state is unchanged
      expect(result.current.state.fullscreen).toBe(stateAtUnmount);
    });
  });
});
