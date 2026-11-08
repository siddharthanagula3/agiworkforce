'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { conversationHref } from '@shared/components/layout/sidebar-session-actions';
import { closeChatTab, getChatTabs, subscribeChatTabs } from '../lib/chat-tab-strip';

/** The chats this window has opened, once Show Tabs is on. */
export function DesktopChatTabs() {
  const router = useRouter();
  const strip = useSyncExternalStore(subscribeChatTabs, getChatTabs, getChatTabs);
  if (!strip.visible || strip.tabs.length === 0) return null;

  return (
    <nav aria-label="Open tabs" className="flex gap-1 px-3 py-1">
      {strip.tabs.map((id) => (
        <span key={id} className="inline-flex items-center gap-1">
          <button type="button" onClick={() => router.push(conversationHref(id))}>
            {id}
          </button>
          <button type="button" aria-label={`Close ${id}`} onClick={() => closeChatTab(id)}>
            Close
          </button>
        </span>
      ))}
    </nav>
  );
}
