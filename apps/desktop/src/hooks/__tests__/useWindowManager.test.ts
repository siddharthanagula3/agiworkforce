/**
 * Unit tests for useWindowManager hook
 * Tests fullscreen functionality and state management
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWindowManager } from '../useWindowManager';
import { invoke, listen } from '../../lib/tauri-mock';

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  isTauri: true, // Simulate Tauri environment in tests
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
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock window instance
    mockGetCurrentWindow.mockReturnValue(mockWindowInstance);

    // Mock window state with fullscreen false
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

    // Mock event listeners with proper cleanup functions
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
            fullscreen: true, // Fullscreen active
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
    it('should listen to window://state events and update fullscreen state', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window://state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalledWith('window://state', expect.any(Function));
      });

      // Simulate fullscreen state change event
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
        if (eventName === 'window://state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      // Start with fullscreen true
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

      // Exit fullscreen
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
        if (eventName === 'window://state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result, unmount } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      unmount();

      // Attempt to trigger event after unmount - should not crash
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

      // Component is unmounted, result should be stable
      expect(result.current.state.fullscreen).toBe(false);
    });
  });

  describe('State Independence', () => {
    it('should track fullscreen and maximized states independently', async () => {
      let stateEventCallback: ((event: any) => void) | null = null;

      vi.mocked(listen).mockImplementation((eventName: string, callback: (event: any) => void) => {
        if (eventName === 'window://state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      // Set both fullscreen and maximized to true
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

      // Exit fullscreen but keep maximized
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
        if (eventName === 'window://state') {
          stateEventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(vi.mocked(listen)).toHaveBeenCalled();
      });

      // Set dock to left
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

      // Enter fullscreen while docked
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

      // Rerender without state changes
      rerender();

      // Actions reference should remain stable
      expect(result.current.actions).toBe(firstActionsRef);
    });

    it('should provide all required window actions', async () => {
      const { result } = renderHook(() => useWindowManager());

      await waitFor(() => {
        expect(result.current.actions).toBeDefined();
      });

      // Verify all actions exist
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

      // Simulate Ctrl+Alt+Left
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

      // Simulate Ctrl+Alt+Right
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

      // Simulate Ctrl+Alt+Down
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
        expect(vi.mocked(listen)).toHaveBeenCalledTimes(3); // state, focus, preview
      });

      unmount();

      // All unlisten functions should be called
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
});
