import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listenMock, invokeMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: true,
  listen: listenMock,
  invoke: invokeMock,
}));

import { useExtensionEvents } from '../useExtensionEvents';
import {
  cleanupExtensionEventListeners,
  initializeExtensionEventListeners,
  useExtensionEventsStore,
} from '../../stores/extensionEventsStore';
import { useUIStore } from '../../stores/ui';

type ListenerCallback<T> = (event: { payload: T }) => void;

describe('useExtensionEvents', () => {
  beforeEach(() => {
    listenMock.mockReset();
    invokeMock.mockReset();
    cleanupExtensionEventListeners();
    useExtensionEventsStore.getState().resetState();
    useUIStore.getState().resetOnLogout();
  });

  afterEach(() => {
    cleanup();
    cleanupExtensionEventListeners();
    useExtensionEventsStore.getState().resetState();
    useUIStore.getState().resetOnLogout();
  });

  it('initializes Tauri extension listeners only once across multiple mounts', async () => {
    listenMock.mockResolvedValue(() => {});

    renderHook(() => useExtensionEvents());
    renderHook(() => useExtensionEvents());

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(3);
    });
  });

  it('retries listener initialization after an async setup failure', async () => {
    let attempt = 0;
    listenMock.mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('listen failed');
      }

      return () => {};
    });

    await initializeExtensionEventListeners();
    expect(listenMock).toHaveBeenCalledTimes(1);

    await initializeExtensionEventListeners();
    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(4);
    });
  });

  it('updates shared extension state without auto-opening the sidecar', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    renderHook(() => useExtensionEvents());

    await waitFor(() => {
      expect(listeners.has('extension:page-context')).toBe(true);
    });

    await act(async () => {
      listeners.get('extension:page-context')?.({
        payload: {
          task_id: 'task-1',
          tab_id: 7,
          url: 'https://example.com',
          title: 'Example Domain',
          actions: [{ type: 'click' }],
          timestamp: Date.now(),
        },
      });
      await Promise.resolve();
    });

    const state = useExtensionEventsStore.getState();
    expect(state.currentPageUrl).toBe('https://example.com');
    expect(state.currentPageTitle).toBe('Example Domain');
    expect(state.agentStatus).toBe('planning');
    expect(useUIStore.getState().sidecarOpen).toBe(false);
  });

  it('stops the agent through the shared store action', async () => {
    listenMock.mockResolvedValue(() => {});
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useExtensionEvents());
    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      await result.current.stopAgent();
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith('agent_stop');
    expect(useExtensionEventsStore.getState().agentStatus).toBe('idle');
    expect(useExtensionEventsStore.getState().lastAction).toBe('Stopped by user');
  });
});
