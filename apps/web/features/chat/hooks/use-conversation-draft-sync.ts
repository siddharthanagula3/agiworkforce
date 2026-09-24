'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/lib/identity/client';
import { useChatStore } from '@shared/stores/web-chat-store';
import { clearPendingDraftClear } from '../lib/pending-draft-clear';
import {
  clearObservedConversationDraftRevisions,
  saveConversationDraft,
} from '../services/conversation-draft';

const DRAFT_SAVE_DEBOUNCE_MS = 1_500;
const DRAFT_RETRY_DELAY_MS = 3_000;
const MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS = 3;

/**
 * Carries the composer's live and parked drafts to the server (§11 Draft persistence).
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
  const [retryTick, setRetryTick] = useState(0);
  const lastSavedRef = useRef<Record<string, string>>({});
  const saveQueueRef = useRef<Record<string, Promise<void>>>({});
  const retryAttemptsRef = useRef<Record<string, { draft: string; count: number }>>({});
  const retryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const mountedRef = useRef(false);
  const authRef = useRef({ getToken, isLoaded, isSignedIn });
  authRef.current = { getToken, isLoaded, isSignedIn };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of Object.values(retryTimersRef.current)) clearTimeout(timer);
      retryTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) clearObservedConversationDraftRevisions();
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const auth = authRef.current;
    if (!auth.isLoaded || !auth.isSignedIn) return;

    for (const [conversationId, attempt] of Object.entries(retryAttemptsRef.current)) {
      if (draftsByConversation[conversationId] === attempt.draft) continue;
      const timer = retryTimersRef.current[conversationId];
      if (timer) clearTimeout(timer);
      delete retryTimersRef.current[conversationId];
      delete retryAttemptsRef.current[conversationId];
    }

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
        const previous = saveQueueRef.current[conversationId] ?? Promise.resolve();
        const queued = previous.then(async () => {
          if (useChatStore.getState().getDraftContent(conversationId) !== draft) return;
          const previousAttempt = retryAttemptsRef.current[conversationId];
          const attempt = previousAttempt?.draft === draft ? previousAttempt.count + 1 : 1;
          retryAttemptsRef.current[conversationId] = { draft, count: attempt };
          const result = await saveConversationDraft(conversationId, draft, async () => {
            const token = await authRef.current.getToken();
            if (!token) throw new Error('Not authenticated');
            return { Authorization: `Bearer ${token}` };
          });
          if (!mountedRef.current) return;
          if (result === 'failed' && lastSavedRef.current[conversationId] === draft) {
            delete lastSavedRef.current[conversationId];
            if (attempt < MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS) {
              retryTimersRef.current[conversationId] = setTimeout(
                () => {
                  delete retryTimersRef.current[conversationId];
                  if (
                    mountedRef.current &&
                    authRef.current.isSignedIn &&
                    useChatStore.getState().getDraftContent(conversationId) === draft
                  ) {
                    setRetryTick((current) => current + 1);
                  }
                },
                DRAFT_RETRY_DELAY_MS * 2 ** (attempt - 1),
              );
            } else {
              toast.error("This draft couldn't sync to your other devices. Retry when ready.", {
                id: `draft-sync-${conversationId}`,
                duration: Infinity,
                action: {
                  label: 'Retry',
                  onClick: () => {
                    if (useChatStore.getState().getDraftContent(conversationId) !== draft) return;
                    delete retryAttemptsRef.current[conversationId];
                    setRetryTick((current) => current + 1);
                  },
                },
              });
            }
          }
          if (result === 'conflict') {
            delete retryAttemptsRef.current[conversationId];
            toast.error(
              'This draft changed elsewhere. Your text is still here, but has not synced.',
              {
                id: `draft-conflict-${conversationId}`,
                duration: Infinity,
              },
            );
          }
          if (result === 'saved') {
            delete retryAttemptsRef.current[conversationId];
            toast.dismiss(`draft-conflict-${conversationId}`);
            toast.dismiss(`draft-sync-${conversationId}`);
          }
          if (
            result === 'saved' &&
            draft === '' &&
            useChatStore.getState().getDraftContent(conversationId) === ''
          ) {
            clearPendingDraftClear(conversationId);
          }
        });
        saveQueueRef.current[conversationId] = queued;
        void queued.finally(() => {
          if (saveQueueRef.current[conversationId] === queued) {
            delete saveQueueRef.current[conversationId];
          }
        });
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draftsByConversation, isLoaded, isSignedIn, retryTick]);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSavedConversationId(value: string): boolean {
  return UUID_RE.test(value);
}
