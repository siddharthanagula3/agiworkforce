'use client';

import { useCallback, useEffect } from 'react';
import { useUnreadConversationsStore } from '@shared/stores/unread-conversations-store';

export interface UnreadConversations {
  isUnread: (conversationId: string) => boolean;
  toggleUnread: (conversationId: string) => void;
}

export function useUnreadConversations(): UnreadConversations {
  const ids = useUnreadConversationsStore((state) => state.ids);
  const toggleUnread = useUnreadConversationsStore((state) => state.toggle);
  const connect = useUnreadConversationsStore((state) => state.connect);

  useEffect(() => connect(), [connect]);

  const isUnread = useCallback((conversationId: string) => ids.has(conversationId), [ids]);

  return { isUnread, toggleUnread };
}
