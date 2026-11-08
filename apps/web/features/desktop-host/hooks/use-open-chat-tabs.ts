'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAppCommand } from '@shared/lib/app-commands';
import { conversationHref } from '@shared/components/layout/sidebar-session-actions';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { chatIdFromPath } from '../lib/adjacent-chat';
import {
  closeChatTab,
  closeChatTabsToTheRight,
  closeOtherChatTabs,
  getChatTabs,
  rememberChatTab,
  reopenClosedChatTab,
} from '../lib/chat-tab-strip';
import { adjacentTabId, type TabStep } from '../lib/open-chat-tabs';

/**
 * Remembers each chat this window opens, then moves to the neighbour when
 * View asks for the previous or next tab.
 */
export function useOpenChatTabs(): void {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const activeRef = useRef<string | null>(null);
  const chatId = chatIdFromPath(pathname);
  if (chatId) activeRef.current = chatId;

  useEffect(() => {
    if (chatId) rememberChatTab(chatId);
  }, [chatId]);

  useEffect(() => {
    const step = (direction: TabStep) => {
      const id = adjacentTabId(getChatTabs().tabs, activeRef.current, direction);
      if (id) router.push(conversationHref(id));
    };
    const stopPrevious = onAppCommand('previous-tab', () => step('previous'));
    const stopNext = onAppCommand('next-tab', () => step('next'));
    const stopNew = onAppCommand('new-tab', () => router.push(NEW_CHAT_PATH));
    const stopReopen = onAppCommand('reopen-closed-tab', () => {
      const id = reopenClosedChatTab();
      if (id) router.push(conversationHref(id));
    });
    const stopFirst = onAppCommand('focus-first-tab', () => {
      const id = getChatTabs().tabs[0];
      if (id) router.push(conversationHref(id));
    });
    const stopClose = onAppCommand('close-active-tab', () => {
      const id = activeRef.current;
      if (id) closeChatTab(id);
    });
    const stopCloseOthers = onAppCommand('close-other-tabs', () => {
      closeOtherChatTabs(activeRef.current);
    });
    const stopCloseRight = onAppCommand('close-tabs-to-the-right', () => {
      closeChatTabsToTheRight(activeRef.current);
    });
    const stopSecond = onAppCommand('focus-second-tab', () => {
      const id = getChatTabs().tabs[1];
      if (id) router.push(conversationHref(id));
    });
    const stopThird = onAppCommand('focus-third-tab', () => {
      const id = getChatTabs().tabs[2];
      if (id) router.push(conversationHref(id));
    });
    const stopFourth = onAppCommand('focus-fourth-tab', () => {
      const id = getChatTabs().tabs[3];
      if (id) router.push(conversationHref(id));
    });
    const stopFifth = onAppCommand('focus-fifth-tab', () => {
      const id = getChatTabs().tabs[4];
      if (id) router.push(conversationHref(id));
    });
    const stopSixth = onAppCommand('focus-sixth-tab', () => {
      const id = getChatTabs().tabs[5];
      if (id) router.push(conversationHref(id));
    });
    const stopSeventh = onAppCommand('focus-seventh-tab', () => {
      const id = getChatTabs().tabs[6];
      if (id) router.push(conversationHref(id));
    });
    const stopEighth = onAppCommand('focus-eighth-tab', () => {
      const id = getChatTabs().tabs[7];
      if (id) router.push(conversationHref(id));
    });
    return () => {
      stopPrevious();
      stopNext();
      stopNew();
      stopReopen();
      stopFirst();
      stopClose();
      stopCloseOthers();
      stopCloseRight();
      stopSecond();
      stopThird();
      stopFourth();
      stopFifth();
      stopSixth();
      stopSeventh();
      stopEighth();
    };
  }, [router]);
}
