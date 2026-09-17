'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/identity/client';
import { useChatStore } from '@shared/stores/web-chat-store';
import { saveConversationDraft } from '../services/conversation-draft';

const DRAFT_SAVE_DEBOUNCE_MS = 1_500;

/**
 * Carries the composer's parked drafts to the server (§11 Draft persistence).
 *
 * It watches the draft map rather than the composer, because that map is the
 * one place every route into a draft already converges: typing, leaving a chat,
 * staging a file from the Library, and the send that clears it.
 *
 * Only a saved conversation gets a draft: the unsaved surface has no row to
 * hold one and keeps its per-tab copy. A temporary chat is refused by the
 * route, so nothing here has to remember that rule twice.
 */
export function useConversationDraftSync(): void {
  const { getToken, isLoaded, isSignedIn } = useSession();
  const draftsByConversation = useChatStore((state) => state.draftsByConversation);
  const lastSavedRef = useRef<Record<string, string>>({});
  const authRef = useRef({ getToken, isLoaded, isSignedIn });
  authRef.current = { getToken, isLoaded, isSignedIn };

  useEffect(() => {
    const auth = authRef.current;
    if (!auth.isLoaded || !auth.isSignedIn) return;

    const pending = Object.entries(draftsByConversation).filter(
      ([conversationId, draft]) =>
        isSavedConversationId(conversationId) && lastSavedRef.current[conversationId] !== draft,
    );
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      for (const [conversationId, draft] of pending) {
        const conversation = useChatStore
          .getState()
          .conversations.find((candidate) => candidate.id === conversationId);
        if (conversation?.isTemporary) continue;
        lastSavedRef.current[conversationId] = draft;
        void saveConversationDraft(conversationId, draft, async () => {
          const token = await authRef.current.getToken();
          if (!token) throw new Error('Not authenticated');
          return { Authorization: `Bearer ${token}` };
        }).then((saved) => {
          if (!saved) delete lastSavedRef.current[conversationId];
        });
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draftsByConversation]);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSavedConversationId(value: string): boolean {
  return UUID_RE.test(value);
}
