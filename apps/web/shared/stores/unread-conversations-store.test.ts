import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUnreadConversations } from '@shared/hooks/use-unread-conversations';
import { UNREAD_STORAGE_KEY, useUnreadConversationsStore } from './unread-conversations-store';

beforeEach(() => {
  window.localStorage.clear();
  useUnreadConversationsStore.setState({ ids: new Set() });
});

afterEach(() => {
  window.localStorage.clear();
});

function storedIds(): unknown {
  return JSON.parse(window.localStorage.getItem(UNREAD_STORAGE_KEY) ?? 'null');
}

describe('unread conversations store', () => {
  it('lets a component that never called the hook follow a mark made elsewhere', () => {
    const follower = renderHook(() => useUnreadConversationsStore((state) => state.ids.size));
    const marker = renderHook(() => useUnreadConversations());

    expect(follower.result.current).toBe(0);
    act(() => marker.result.current.toggleUnread('c1'));

    expect(follower.result.current).toBe(1);
  });

  it('shares one set between two hook consumers', () => {
    const first = renderHook(() => useUnreadConversations());
    const second = renderHook(() => useUnreadConversations());

    act(() => first.result.current.toggleUnread('c1'));

    expect(second.result.current.isUnread('c1')).toBe(true);
    act(() => second.result.current.toggleUnread('c1'));
    expect(first.result.current.isUnread('c1')).toBe(false);
  });

  it('writes every change through to storage in the existing format', () => {
    const { result } = renderHook(() => useUnreadConversations());

    act(() => result.current.toggleUnread('c1'));
    act(() => result.current.toggleUnread('c2'));
    expect(storedIds()).toEqual(['c1', 'c2']);

    act(() => result.current.toggleUnread('c1'));
    expect(storedIds()).toEqual(['c2']);
  });

  it('follows a change another tab stores', () => {
    const { result } = renderHook(() => useUnreadConversations());

    act(() => {
      window.localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(['c9']));
      window.dispatchEvent(new StorageEvent('storage', { key: UNREAD_STORAGE_KEY }));
    });
    expect(result.current.isUnread('c9')).toBe(true);

    act(() => {
      window.localStorage.removeItem(UNREAD_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.isUnread('c9')).toBe(false);
  });

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => useUnreadConversations());
    act(() => result.current.toggleUnread('c1'));

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
    });

    expect(result.current.isUnread('c1')).toBe(true);
  });

  it('stops listening once the last consumer unmounts', () => {
    const { result, unmount } = renderHook(() => useUnreadConversations());
    unmount();

    act(() => {
      window.localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(['c9']));
      window.dispatchEvent(new StorageEvent('storage', { key: UNREAD_STORAGE_KEY }));
    });

    expect(result.current.isUnread('c9')).toBe(false);
  });
});
