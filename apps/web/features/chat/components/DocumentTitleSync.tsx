'use client';

import { useEffect } from 'react';

const SUFFIX = 'AGI';
const MAX_TITLE_CHARS = 60;

export function useDocumentTitleSync(
  activeConversationId: string | null,
  conversationTitle: string | undefined,
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const raw = conversationTitle?.trim();
    const label = raw && raw.length > 0 ? raw : activeConversationId ? 'New chat' : '';
    const trimmed =
      label.length > MAX_TITLE_CHARS ? `${label.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : label;

    document.title = trimmed ? `${trimmed} · ${SUFFIX}` : SUFFIX;
  }, [activeConversationId, conversationTitle]);
}
