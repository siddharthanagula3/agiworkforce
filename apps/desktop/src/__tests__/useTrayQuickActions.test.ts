import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTrayQuickActions } from '../hooks/useTrayQuickActions';

type EventCallback<T> = (event: { payload: T }) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: event callbacks with varying payloads
const listeners: Record<string, EventCallback<any>> = {};

vi.mock('../lib/tauri-mock', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: event callback
  listen: vi.fn((event: string, handler: EventCallback<any>) => {
    listeners[event] = handler;
    return Promise.resolve(() => {
      delete listeners[event];
    });
  }),
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: true,
}));

const { listen, invoke } = await import('../lib/tauri-mock');
const listenMock = vi.mocked(listen);
const invokeMock = vi.mocked(invoke);

describe('useTrayQuickActions', () => {
  beforeEach(() => {
    Object.keys(listeners).forEach((key) => delete listeners[key]);
    listenMock.mockClear();
    invokeMock.mockClear();
  });

  it('registers tray listeners and forwards events', async () => {
    const onNewConversation = vi.fn();
    const onOpenSettings = vi.fn();

    renderHook(() =>
      useTrayQuickActions({
        onNewConversation,
        onOpenSettings,
        unreadCount: 3,
      }),
    );

    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith('tray:new_conversation', expect.any(Function)),
    );
    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith('tray:open_settings', expect.any(Function)),
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('tray_set_unread_badge', { count: 3 }),
    );

    await act(async () => {
      await listeners['tray:new_conversation']?.({
        payload: null,
      });
      await listeners['tray:open_settings']?.({
        payload: null,
      });
    });

    expect(onNewConversation).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('clamps unread count before invoking backend', async () => {
    renderHook(() =>
      useTrayQuickActions({
        onNewConversation: vi.fn(),
        onOpenSettings: vi.fn(),
        unreadCount: 120,
      }),
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('tray_set_unread_badge', { count: 99 }),
    );
  });
});
