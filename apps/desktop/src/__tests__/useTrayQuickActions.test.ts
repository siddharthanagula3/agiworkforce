import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listen, type EventCallback } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useTrayQuickActions } from '../hooks/useTrayQuickActions';

const listeners: Record<string, EventCallback<any>> = {};

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: EventCallback<any>) => {
    listeners[event] = handler;
    return Promise.resolve(() => {
      delete listeners[event];
    });
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

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
      })
    );

    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith('tray://new-conversation', expect.any(Function))
    );
    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith('tray://open-settings', expect.any(Function))
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('tray_set_unread_badge', { count: 3 })
    );

    await act(async () => {
      await listeners['tray://new-conversation']?.({ payload: undefined } as any);
      await listeners['tray://open-settings']?.({ payload: undefined } as any);
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
      })
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('tray_set_unread_badge', { count: 99 })
    );
  });
});
