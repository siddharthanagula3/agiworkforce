/**
 * Integration tests for window state persistence
 * Tests that fullscreen state is properly saved and restored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowManager } from '../hooks/useWindowManager';

const { mockInvoke, mockListen, mockGetCurrentWindow } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
  mockGetCurrentWindow: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: (...args: unknown[]) => mockGetCurrentWindow(...args),
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

  const mockWindowInstance = {
    minimize: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stateEventCallback = null;

    // Reset persisted state
    persistedState = {
      pinned: true,
      alwaysOnTop: false,
      dock: null,
      maximized: false,
      fullscreen: false,
    };

    mockGetCurrentWindow.mockReturnValue(mockWindowInstance);

    // Updated Nov 16, 2025: Fixed incorrect mock implementation for toggle_maximize
    // Mock invoke to simulate backend persistence
    mockInvoke.mockImplementation((command: string, args?: any) => {
      if (command === 'window_get_state') {
        return Promise.resolve({ ...persistedState });
      }
      if (command === 'window_set_fullscreen') {
        persistedState.fullscreen = args.fullscreen;
        return Promise.resolve();
      }
      if (command === 'window_toggle_maximize') {
        // Bug fix: Toggle maximized state, not fullscreen
        // Maximize and fullscreen are different window states
        persistedState.maximized = !persistedState.maximized;
        return Promise.resolve();
      }
      if (command === 'window_set_pinned') {
        persistedState.pinned = args.pinned;
        return Promise.resolve();
      }
      if (command === 'window_set_always_on_top') {
        persistedState.alwaysOnTop = args.value;
        return Promise.resolve();
      }
      if (command === 'window_dock') {
        persistedState.dock = args.position;
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    // Mock event listeners
    mockListen.mockImplementation((eventName: string, callback: (event: any) => void) => {
      if (eventName === 'window://state') {
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
      // Set persisted state to fullscreen
      persistedState.fullscreen = true;

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('window_get_state');
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
    // Updated Nov 16, 2025: Fixed to test maximize state instead of fullscreen
    it('should persist maximize state when toggling maximize', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Toggle to maximized
      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      // Verify backend was called
      expect(mockInvoke).toHaveBeenCalledWith('window_toggle_maximize');

      // Simulate backend state update event (maximized, not fullscreen)
      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, maximized: true },
          });
        }
      });

      // Verify state updated
      await waitFor(() => {
        expect(result.current.state.maximized).toBe(true);
      });

      // Create a new hook instance to simulate app restart
      const { result: newResult } = renderHook(() => useWindowManager());

      // Should restore the persisted maximize state
      await waitFor(() => {
        expect(newResult.current.state.maximized).toBe(true);
      });
    });

    // Updated Nov 16, 2025: Fixed to test maximize state instead of fullscreen
    it('should persist state across multiple toggles', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Toggle maximize on
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

      // Toggle maximize off
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

      // Create new instance - should have latest state
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

      // Perform multiple actions rapidly
      await act(async () => {
        await result.current.actions.setPinned(false);
        await result.current.actions.toggleMaximize();
        await result.current.actions.setAlwaysOnTop(true);
      });

      // Updated Nov 16, 2025: Fixed to update maximized state instead of fullscreen
      // Simulate backend events
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

      // All states should be updated
      await waitFor(() => {
        expect(result.current.state.pinned).toBe(false);
        expect(result.current.state.alwaysOnTop).toBe(true);
        expect(result.current.state.maximized).toBe(true);
      });
    });

    // Updated Nov 16, 2025: Fixed to test maximize state instead of fullscreen
    it('should handle dock and maximize state changes together', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Dock to left
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

      // Maximize while docked
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

      // Verify persisted state has both
      expect(persistedState.dock).toBe('left');
      expect(persistedState.maximized).toBe(true);
    });
  });

  describe('State Recovery After Errors', () => {
    it('should maintain state when toggle fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock failure
      mockInvoke.mockImplementation((command: string) => {
        if (command === 'window_toggle_maximize') {
          return Promise.reject(new Error('Window operation failed'));
        }
        if (command === 'window_get_state') {
          return Promise.resolve({ ...persistedState });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Updated Nov 16, 2025: Test maximize state instead of fullscreen
      const initialMaximized = result.current.state.maximized;

      // Attempt toggle (will fail)
      await act(async () => {
        await result.current.actions.toggleMaximize();
      });

      // State should remain unchanged after error
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

      // Manually corrupt local state (simulating desync)
      await act(async () => {
        if (stateEventCallback) {
          stateEventCallback({
            payload: { ...persistedState, fullscreen: true },
          });
        }
      });

      // But backend has different state
      persistedState.fullscreen = false;

      // Refresh state
      await act(async () => {
        await result.current.actions.refresh();
      });

      // Should sync with backend
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

      // Start an async operation
      const togglePromise = act(async () => {
        await result.current.actions.toggleMaximize();
      });

      // Unmount before operation completes
      unmount();

      // Should not throw errors
      await expect(togglePromise).resolves.toBeUndefined();
    });

    it('should handle null/undefined dock values correctly', async () => {
      persistedState.dock = null;

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.state.dock).toBeNull();
      });

      // Undock explicitly
      await act(async () => {
        await result.current.actions.dock(null);
      });

      expect(result.current.state.dock).toBeNull();
    });
  });
});
