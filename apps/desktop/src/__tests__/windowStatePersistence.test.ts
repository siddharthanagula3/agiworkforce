import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowManager } from '../hooks/useWindowManager';
import { invoke, listen } from '../lib/tauri-mock';

vi.mock('../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  isTauri: true,
}));

// AUDIT-P3-TEST-TYPE: Define properly typed window state interface for test mocks
interface WindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: 'left' | 'right' | null;
  maximized: boolean;
  fullscreen: boolean;
}

// AUDIT-P3-TEST-TYPE: Match the EventCallback type from tauri-mock
interface TauriEvent<T> {
  payload: T;
  id: number;
}

describe('Window State Persistence - Integration Tests', () => {
  // AUDIT-P3-TEST-TYPE: Properly typed event callback using TauriEvent
  let stateEventCallback: ((event: TauriEvent<WindowState>) => void) | null = null;
  let persistedState: WindowState = {
    pinned: true,
    alwaysOnTop: false,
    dock: null,
    maximized: false,
    fullscreen: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stateEventCallback = null;

    persistedState = {
      pinned: true,
      alwaysOnTop: false,
      dock: null,
      maximized: false,
      fullscreen: false,
    };

    // AUDIT-P3-TEST-TYPE: Properly typed mock implementation for invoke
    vi.mocked(invoke).mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'window_get_state') {
        return Promise.resolve({ ...persistedState });
      }
      if (command === 'window_set_fullscreen') {
        persistedState.fullscreen = (args as { fullscreen: boolean }).fullscreen;
        return Promise.resolve(undefined);
      }
      if (command === 'window_toggle_maximize') {
        persistedState.maximized = !persistedState.maximized;
        return Promise.resolve(undefined);
      }
      if (command === 'window_set_pinned') {
        persistedState.pinned = (args as { pinned: boolean }).pinned;
        return Promise.resolve(undefined);
      }
      if (command === 'window_set_always_on_top') {
        persistedState.alwaysOnTop = (args as { value: boolean }).value;
        return Promise.resolve(undefined);
      }
      if (command === 'window_dock') {
        persistedState.dock = (args as { position: 'left' | 'right' | null }).position;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    // AUDIT-P3-TEST-TYPE: Properly typed mock implementation for listen using TauriEvent
    vi.mocked(listen).mockImplementation(
      (eventName: string, callback: (event: TauriEvent<WindowState>) => void) => {
        if (eventName === 'window:state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      },
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State Restoration', () => {
    it('should restore fullscreen state from persisted data on mount', async () => {
      persistedState.fullscreen = true;

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_get_state');
        expect(result.current.state.fullscreen).toBe(true);
      });
    });

    it('should restore all window state properties together', async () => {
      persistedState = {
        pinned: false,
        alwaysOnTop: true,
        dock: 'left',
        maximized: false,
        fullscreen: true,
      };

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.pinned).toBe(false);
        expect(result.current.state.alwaysOnTop).toBe(true);
        expect(result.current.state.dock).toBe('left');
        expect(result.current.state.maximized).toBe(false);
        expect(result.current.state.fullscreen).toBe(true);
      });
    });

    it('should default to non-fullscreen if no persisted state exists', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(false);
      });
    });
  });

  describe('State Persistence on Changes', () => {
    it('should persist maximize state when toggling maximize', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('window_toggle_maximize');

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, maximized: true },
            id: 1,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.maximized).toBe(true);
      });

      const { result: newResult } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(newResult.current.state.maximized).toBe(true);
      });
    });

    it('should persist state across multiple toggles', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, maximized: true },
            id: 1,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.maximized).toBe(true);
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, maximized: false },
            id: 2,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.maximized).toBe(false);
      });

      const { result: newResult } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(newResult.current.state.maximized).toBe(false);
      });
    });
  });

  describe('Concurrent State Updates', () => {
    it('should handle multiple state changes in quick succession', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.setPinned(false);
        await result.current.actions.toggleMaximize();
        await result.current.actions.setAlwaysOnTop(true);
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: {
              pinned: false,
              alwaysOnTop: true,
              dock: null,
              maximized: true,
              fullscreen: false,
            },
            id: 3,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.pinned).toBe(false);
        expect(result.current.state.alwaysOnTop).toBe(true);
        expect(result.current.state.maximized).toBe(true);
      });
    });

    it('should handle dock and maximize state changes together', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        await result.current.actions.dock('left');
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, dock: 'left' },
            id: 4,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.dock).toBe('left');
      });

      await act(async () => {
        await result.current.actions.toggleMaximize();
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, dock: 'left', maximized: true },
            id: 5,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.state.dock).toBe('left');
        expect(result.current.state.maximized).toBe(true);
      });

      expect(persistedState.dock).toBe('left');
      expect(persistedState.maximized).toBe(true);
    });
  });

  describe('State Recovery After Errors', () => {
    it('should maintain state when toggle fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // AUDIT-P3-TEST-TYPE: Properly typed mock implementation for error handling
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_toggle_maximize') {
          return Promise.reject(new Error('Window operation failed'));
        }
        if (command === 'window_get_state') {
          return Promise.resolve({ ...persistedState });
        }
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const initialMaximized = result.current.state.maximized;

      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      await waitFor(() => {
        expect(result.current.state.maximized).toBe(initialMaximized);
      });

      consoleErrorSpy.mockRestore();
    });

    it('should recover state on refresh after error', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, fullscreen: true },
            id: 6,
          });
        }
      });

      persistedState.fullscreen = false;

      await act(async () => {
        await result.current.actions.refresh();
      });

      await waitFor(() => {
        expect(result.current.state.fullscreen).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid mount/unmount cycles', async () => {
      for (let i = 0; i < 5; i++) {
        const { result, unmount } = renderHook(() => useWindowManager());

        await waitFor(() => {
          expect(result.current.actions).toBeDefined();
        });

        expect(result.current.state.fullscreen).toBe(persistedState.fullscreen);

        unmount();
      }
    });

    it('should handle state updates during unmount', async () => {
      const { result, unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      const togglePromise = act(async () => {
        await result.current.actions.toggleMaximize();
      });

      unmount();

      await expect(togglePromise).resolves.toBeUndefined();
    });

    it('should handle null/undefined dock values correctly', async () => {
      persistedState.dock = null;

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.dock).toBeNull();
      });

      await act(async () => {
        await result.current.actions.dock(null);
      });

      expect(result.current.state.dock).toBeNull();
    });
  });
});
