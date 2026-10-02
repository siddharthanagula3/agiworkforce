'use client';

import { useEffect } from 'react';
import { conversationDocumentTitle } from '../lib/conversation-document-title';

export function useDocumentTitleSync(
  activeConversationId: string | null,
  conversationTitle: string | undefined,
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = conversationDocumentTitle(conversationTitle, Boolean(activeConversationId));
  }, [activeConversationId, conversationTitle]);
}
