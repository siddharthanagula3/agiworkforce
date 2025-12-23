import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowManager } from '../hooks/useWindowManager';
import { invoke, listen } from '../lib/tauri-mock';

vi.mock('../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  isTauri: true,
}));

describe('Window State Persistence - Integration Tests', () => {
  let stateEventCallback: ((event: any) => void) | null = null;
  let persistedState: {
    pinned: boolean;
    alwaysOnTop: boolean;
    dock: 'left' | 'right' | null;
    maximized: boolean;
    fullscreen: boolean;
  } = {
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

    vi.mocked(invoke).mockImplementation((command: string, args?: any) => {
      if (command === 'window_get_state') {
        return Promise.resolve({ ...persistedState } as any);
      }
      if (command === 'window_set_fullscreen') {
        persistedState.fullscreen = args.fullscreen;
        return Promise.resolve(undefined as any);
      }
      if (command === 'window_toggle_maximize') {
        persistedState.maximized = !persistedState.maximized;
        return Promise.resolve(undefined as any);
      }
      if (command === 'window_set_pinned') {
        persistedState.pinned = args.pinned;
        return Promise.resolve(undefined as any);
      }
      if (command === 'window_set_always_on_top') {
        persistedState.alwaysOnTop = args.value;
        return Promise.resolve(undefined as any);
      }
      if (command === 'window_dock') {
        persistedState.dock = args.position;
        return Promise.resolve(undefined as any);
      }
      return Promise.resolve(undefined as any);
    });

    vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
      if (eventName === 'window:state') {
        stateEventCallback = callback;
      }
      return Promise.resolve(() => {});
    });
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

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === 'window_toggle_maximize') {
          return Promise.reject(new Error('Window operation failed'));
        }
        if (command === 'window_get_state') {
          return Promise.resolve({ ...persistedState } as any);
        }
        return Promise.resolve(undefined as any);
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
