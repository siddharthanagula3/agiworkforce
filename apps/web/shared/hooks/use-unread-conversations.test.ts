import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUnreadConversations } from './use-unread-conversations';

const STORAGE_KEY = 'agi.sidebar.unreadConversationIds';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('unread marks outlive the tab that made them', () => {
  it('starts from nothing when the browser has never stored a mark', () => {
    const { result } = renderHook(() => useUnreadConversations());
    expect(result.current.isUnread('c1')).toBe(false);
  });

  it('carries a mark into the next mount, which is what a reload is', () => {
    const first = renderHook(() => useUnreadConversations());
    act(() => first.result.current.toggleUnread('c1'));
    expect(first.result.current.isUnread('c1')).toBe(true);
    first.unmount();

    const second = renderHook(() => useUnreadConversations());
    expect(second.result.current.isUnread('c1')).toBe(true);
    expect(second.result.current.isUnread('c2')).toBe(false);
  });

  it('clears the mark for good when it is toggled back', () => {
    const first = renderHook(() => useUnreadConversations());
    act(() => first.result.current.toggleUnread('c1'));
    act(() => first.result.current.toggleUnread('c1'));
    first.unmount();

    const second = renderHook(() => useUnreadConversations());
    expect(second.result.current.isUnread('c1')).toBe(false);
  });

  it('ignores a stored value that is not a list of ids rather than throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"not":"an array"}');
    const { result } = renderHook(() => useUnreadConversations());
    expect(result.current.isUnread('c1')).toBe(false);
  });

  it('drops entries that are not ids from a hand-edited store', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['c1', 7, null]));
    const { result } = renderHook(() => useUnreadConversations());
    expect(result.current.isUnread('c1')).toBe(true);
  });
});
