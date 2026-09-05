'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * "Mark as unread" from the chat row menu has no server column (conversations
 * carry pinned/starred/archived, all real DB fields; unread would need a
 * migration, and the founder-gated migration list has no room for a
 * cosmetic per-viewer flag). Stored per-browser instead, the same tier as a
 * collapsed sidebar section or a remembered tab: durable enough to survive a
 * reload, private to this device, never claimed as synced state elsewhere.
 */
const UNREAD_STORAGE_KEY = 'agi.sidebar.unreadConversationIds';

function readStoredIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(UNREAD_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id) => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeStoredIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can throw (quota, private mode); the toggle still works for
    // the rest of this session, it just will not survive a reload.
  }
}

export interface UnreadConversations {
  isUnread: (conversationId: string) => boolean;
  toggleUnread: (conversationId: string) => void;
}

export function useUnreadConversations(): UnreadConversations {
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setUnreadIds(readStoredIds());
  }, []);

  const toggleUnread = useCallback((conversationId: string) => {
    setUnreadIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      writeStoredIds(next);
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (conversationId: string) => unreadIds.has(conversationId),
    [unreadIds],
  );

  return { isUnread, toggleUnread };
}
