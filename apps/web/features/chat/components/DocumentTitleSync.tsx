'use client';

import { useEffect } from 'react';
import { useChatStore } from '@shared/stores/web-chat-store';
import { conversationDocumentTitle } from '../lib/conversation-document-title';

export function useDocumentTitleSync(displayedConversationId: string | null): void {
  const conversationTitle = useChatStore((state) =>
    displayedConversationId
      ? state.conversations.find((conversation) => conversation.id === displayedConversationId)
          ?.title
      : null,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (displayedConversationId && conversationTitle === undefined) return;
    document.title = conversationDocumentTitle(conversationTitle, Boolean(displayedConversationId));
  }, [displayedConversationId, conversationTitle]);
}
