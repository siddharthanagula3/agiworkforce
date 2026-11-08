'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAppCommand } from '@shared/lib/app-commands';
import { conversationHref } from '@shared/components/layout/sidebar-session-actions';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  adjacentChatId,
  chatIdFromPath,
  visibleChatIds,
  type ChatStep,
} from '../lib/adjacent-chat';

/**
 * Opens the neighbouring chat when History asks for the previous or next one.
 */
export function useAdjacentChat(): void {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const conversations = useChatStore((state) => state.conversations);
  const ids = visibleChatIds(conversations);
  const currentId = chatIdFromPath(pathname);
  const idsRef = useRef(ids);
  const currentRef = useRef(currentId);
  idsRef.current = ids;
  currentRef.current = currentId;

  useEffect(() => {
    const step = (direction: ChatStep) => {
      const id = adjacentChatId(idsRef.current, currentRef.current, direction);
      if (id) router.push(conversationHref(id));
    };
    const stopPrevious = onAppCommand('previous-chat', () => step('previous'));
    const stopNext = onAppCommand('next-chat', () => step('next'));
    return () => {
      stopPrevious();
      stopNext();
    };
  }, [router]);
}
