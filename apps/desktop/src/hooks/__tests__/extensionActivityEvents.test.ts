import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listenMock, invokeMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
  listen: listenMock,
  invoke: invokeMock,
}));

import {
  cleanupRuntimeActivityEventListeners,
  initializeRuntimeActivityEventListeners,
} from '../useAgenticEvents';
import { useUIStore } from '../../stores/ui';

type ListenerCallback<T> = (event: { payload: T }) => void;

describe('extension activity events', () => {
  beforeEach(() => {
    listenMock.mockReset();
    invokeMock.mockReset();
    cleanupRuntimeActivityEventListeners();
    useUIStore.getState().resetOnLogout();
  });

  afterEach(() => {
    cleanup();
    cleanupRuntimeActivityEventListeners();
    useUIStore.getState().resetOnLogout();
  });

  it('initializes runtime activity listeners only once across repeated startup calls', async () => {
    listenMock.mockResolvedValue(() => {});
    await initializeRuntimeActivityEventListeners();
    const initialCallCount = listenMock.mock.calls.length;
    await initializeRuntimeActivityEventListeners();

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(initialCallCount);
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

    await expect(initializeRuntimeActivityEventListeners()).rejects.toThrow('listen failed');
    expect(listenMock).toHaveBeenCalledTimes(1);

    await initializeRuntimeActivityEventListeners();
    await waitFor(() => {
      expect(listenMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('records extension page context without auto-opening the sidecar', async () => {
    const listeners = new Map<string, ListenerCallback<unknown>>();
    listenMock.mockImplementation(
      async (eventName: string, callback: ListenerCallback<unknown>) => {
        listeners.set(eventName, callback);
        return () => {};
      },
    );

    await initializeRuntimeActivityEventListeners();

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

    expect(useUIStore.getState().sidecarOpen).toBe(false);
  });
});
