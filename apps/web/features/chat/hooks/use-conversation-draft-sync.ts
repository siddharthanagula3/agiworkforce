'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MANAGED_CLOUD_DRAFT_SAVE_DEBOUNCE_MS } from '@agiworkforce/cloud-contracts';
import { toast } from 'sonner';
import { useSession } from '@/lib/identity/client';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { isUuid } from '@/lib/uuid';
import { useLocalModelSelection } from '@features/desktop-host';
import { useChatStore } from '@shared/stores/web-chat-store';
import { conversationHoldsLocalTurns } from '../lib/local-turn';
import { clearPendingDraftClear, readPendingDraftClearToken } from '../lib/pending-draft-clear';
import {
  clearPersistedDraft,
  writePersistedDraft,
} from '../components/Composer/composer-draft-storage';
import {
  adoptConversationDraftRevision,
  bindConversationDraftOwners,
  isConversationDraftOwnerCurrent,
  saveConversationDraft,
} from '../services/conversation-draft';

const DRAFT_RETRY_DELAY_MS = 3_000;
const MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS = 3;

export interface OpenDraftConflict {
  conversationId: string;
  theirs: string;
  theirsRevision: string | null;
}

export interface DraftReplacement {
  conversationId: string;
  content: string;
  nonce: number;
  isCurrent: () => boolean;
}

export interface DraftConflictControls {
  conflict: OpenDraftConflict | null;
  replacement: DraftReplacement | null;
  resolveConflict: (keep: 'mine' | 'theirs') => void;
  closeConflict: () => void;
  consumeReplacement: (nonce: number) => void;
}

interface DraftJob {
  conversationId: string;
  draft: string;
  owner: object;
  session: SessionAuthority;
  uiOwner: object;
  clearToken: string | null;
}

interface OwnedDraftConflict extends OpenDraftConflict {
  job: DraftJob;
}

function isCurrentDraft(job: DraftJob): boolean {
  const state = useChatStore.getState();
  return (
    job.session.isCurrent() &&
    isConversationDraftOwnerCurrent(job.owner, job.session) &&
    Object.hasOwn(state.draftsByConversation, job.conversationId) &&
    state.draftOwnersByConversation[job.conversationId] === job.owner &&
    state.draftsByConversation[job.conversationId] === job.draft
  );
}

function canDispatchDraft(job: DraftJob): boolean {
  if (!isCurrentDraft(job)) return false;
  const state = useChatStore.getState();
  const conversation = state.conversations.find((candidate) => candidate.id === job.conversationId);
  return (
    !conversation?.isTemporary &&
    (job.draft === '' ||
      (useLocalModelSelection.getState().selected === null &&
        !conversationHoldsLocalTurns(state.messagesByConversation[job.conversationId] ?? [])))
  );
}

export function useConversationDraftSync(): DraftConflictControls {
  const { isLoaded, isSignedIn } = useSession();
  const captureSession = useSessionSnapshot();
  const sessionRef = useRef<SessionAuthority | null>(null);
  if (!sessionRef.current?.isCurrent()) sessionRef.current = captureSession();
  const session = sessionRef.current;
  const draftsByConversation = useChatStore((state) => state.draftsByConversation);
  const draftOwnersByConversation = useChatStore((state) => state.draftOwnersByConversation);
  if (session) bindConversationDraftOwners(session, draftOwnersByConversation);
  const localModelSelected = useLocalModelSelection((state) => state.selected !== null);
  const [retryTick, setRetryTick] = useState(0);
  const [openConflict, setOpenConflict] = useState<OwnedDraftConflict | null>(null);
  const [replacement, setReplacement] = useState<DraftReplacement | null>(null);
  const conflictsRef = useRef<Record<string, OwnedDraftConflict>>({});
  const replacementNonceRef = useRef(0);
  const lastSavedRef = useRef<Record<string, object>>({});
  const notOnServerRef = useRef<Set<string>>(new Set());
  const retryAttemptsRef = useRef<Record<string, { owner: object; count: number }>>({});
  const retryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const mountedRef = useRef(false);
  const uiOwnerRef = useRef({ session });
  if (uiOwnerRef.current.session !== session) uiOwnerRef.current = { session };

  const canPublish = useCallback(
    (job: DraftJob) =>
      mountedRef.current && uiOwnerRef.current === job.uiOwner && canDispatchDraft(job),
    [],
  );

  useEffect(() => {
    uiOwnerRef.current = { session };
    mountedRef.current = true;
    lastSavedRef.current = {};
    notOnServerRef.current.clear();
    retryAttemptsRef.current = {};
    conflictsRef.current = {};
    setOpenConflict(null);
    setReplacement(null);
    return () => {
      mountedRef.current = false;
      uiOwnerRef.current = { session: null };
      for (const timer of Object.values(retryTimersRef.current)) clearTimeout(timer);
      retryTimersRef.current = {};
      for (const conversationId of Object.keys(conflictsRef.current)) {
        toast.dismiss(`draft-conflict-${conversationId}`);
      }
      for (const conversationId of Object.keys(retryAttemptsRef.current)) {
        toast.dismiss(`draft-sync-${conversationId}`);
      }
    };
  }, [session]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !session?.isCurrent()) return;

    for (const [conversationId, attempt] of Object.entries(retryAttemptsRef.current)) {
      if (draftOwnersByConversation[conversationId] === attempt.owner) continue;
      const timer = retryTimersRef.current[conversationId];
      if (timer) clearTimeout(timer);
      delete retryTimersRef.current[conversationId];
      delete retryAttemptsRef.current[conversationId];
      toast.dismiss(`draft-sync-${conversationId}`);
    }
    for (const [conversationId, conflict] of Object.entries(conflictsRef.current)) {
      if (canPublish(conflict.job)) continue;
      delete conflictsRef.current[conversationId];
      toast.dismiss(`draft-conflict-${conversationId}`);
      setOpenConflict((current) => (current === conflict ? null : current));
    }

    const pending: DraftJob[] = Object.entries(draftsByConversation).flatMap(
      ([conversationId, draft]) => {
        const owner = draftOwnersByConversation[conversationId];
        if (!isUuid(conversationId) || !owner || lastSavedRef.current[conversationId] === owner)
          return [];
        const previousAttempt = retryAttemptsRef.current[conversationId];
        if (
          previousAttempt?.owner === owner &&
          previousAttempt.count >= MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS
        )
          return [];
        return [
          {
            conversationId,
            draft,
            owner,
            session,
            uiOwner: uiOwnerRef.current,
            clearToken: draft === '' ? readPendingDraftClearToken(conversationId) : null,
          },
        ];
      },
    );
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      for (const job of pending) {
        const { conversationId, draft, owner } = job;
        if (!canPublish(job)) continue;
        if (notOnServerRef.current.has(conversationId)) {
          if (
            !useChatStore
              .getState()
              .conversations.some((candidate) => candidate.id === conversationId)
          )
            continue;
          notOnServerRef.current.delete(conversationId);
        }
        const previousTimer = retryTimersRef.current[conversationId];
        if (previousTimer !== undefined) clearTimeout(previousTimer);
        delete retryTimersRef.current[conversationId];
        lastSavedRef.current[conversationId] = owner;
        const previousAttempt = retryAttemptsRef.current[conversationId];
        const attempt = previousAttempt?.owner === owner ? previousAttempt.count + 1 : 1;
        const attemptOwner = { owner, count: attempt };
        retryAttemptsRef.current[conversationId] = attemptOwner;
        void saveConversationDraft(conversationId, draft, session, () =>
          canDispatchDraft(job),
        ).then((result) => {
          if (result === 'saved' && draft === '' && job.clearToken && isCurrentDraft(job)) {
            clearPendingDraftClear(conversationId, job.clearToken);
          }
          if (!canPublish(job)) {
            if (
              uiOwnerRef.current === job.uiOwner &&
              lastSavedRef.current[conversationId] === owner
            ) {
              delete lastSavedRef.current[conversationId];
            }
            return;
          }
          if (result === 'superseded') {
            if (lastSavedRef.current[conversationId] === owner)
              delete lastSavedRef.current[conversationId];
            return;
          }
          if (result === 'not_saved_yet') {
            delete retryAttemptsRef.current[conversationId];
            delete lastSavedRef.current[conversationId];
            notOnServerRef.current.add(conversationId);
            return;
          }
          if (result === 'failed' && lastSavedRef.current[conversationId] === owner) {
            delete lastSavedRef.current[conversationId];
            if (attempt < MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS) {
              const retryTimer = setTimeout(
                () => {
                  if (retryTimersRef.current[conversationId] !== retryTimer) return;
                  delete retryTimersRef.current[conversationId];
                  if (
                    retryAttemptsRef.current[conversationId] === attemptOwner &&
                    canPublish(job)
                  ) {
                    setRetryTick((current) => current + 1);
                  }
                },
                DRAFT_RETRY_DELAY_MS * 2 ** (attempt - 1),
              );
              retryTimersRef.current[conversationId] = retryTimer;
            } else {
              toast.error(
                isDraftOnScreen(conversationId)
                  ? "This draft couldn't sync to your other devices. Retry when ready."
                  : `Your draft in "${conversationTitle(conversationId)}" couldn't sync to your other devices. Retry when ready.`,
                {
                  id: `draft-sync-${conversationId}`,
                  duration: Infinity,
                  action: {
                    label: 'Retry',
                    onClick: () => {
                      if (
                        retryAttemptsRef.current[conversationId] !== attemptOwner ||
                        !canPublish(job)
                      )
                        return;
                      delete retryAttemptsRef.current[conversationId];
                      setRetryTick((current) => current + 1);
                    },
                  },
                },
              );
            }
          }
          if (typeof result === 'object') {
            delete retryAttemptsRef.current[conversationId];
            const conflict: OwnedDraftConflict = {
              conversationId,
              theirs: result.theirs,
              theirsRevision: result.theirsRevision,
              job,
            };
            conflictsRef.current[conversationId] = conflict;
            setOpenConflict((current) =>
              current?.conversationId === conversationId ? conflict : current,
            );
            toast.error(
              isDraftOnScreen(conversationId)
                ? 'This draft changed elsewhere. Your text is still here, but has not synced.'
                : `Your draft in "${conversationTitle(conversationId)}" changed elsewhere and has not synced.`,
              {
                id: `draft-conflict-${conversationId}`,
                duration: Infinity,
                action: {
                  label: 'Compare',
                  onClick: () => {
                    if (conflictsRef.current[conversationId] === conflict && canPublish(job))
                      setOpenConflict(conflict);
                  },
                },
              },
            );
          }
          if (result === 'saved') {
            delete retryAttemptsRef.current[conversationId];
            delete conflictsRef.current[conversationId];
            setOpenConflict((current) =>
              current?.conversationId === conversationId ? null : current,
            );
            toast.dismiss(`draft-conflict-${conversationId}`);
            toast.dismiss(`draft-sync-${conversationId}`);
          }
        });
      }
    }, MANAGED_CLOUD_DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    draftsByConversation,
    draftOwnersByConversation,
    isLoaded,
    isSignedIn,
    localModelSelected,
    retryTick,
    session,
    canPublish,
  ]);

  const closeConflict = useCallback(() => {
    setOpenConflict((current) => (current === openConflict ? null : current));
  }, [openConflict]);
  const consumeReplacement = useCallback((nonce: number) => {
    setReplacement((current) => (current?.nonce === nonce ? null : current));
  }, []);

  const resolveConflict = useCallback(
    (keep: 'mine' | 'theirs') => {
      if (!openConflict) return;
      const { conversationId, theirs, theirsRevision, job } = openConflict;
      if (conflictsRef.current[conversationId] !== openConflict || !canPublish(job)) return;
      delete conflictsRef.current[conversationId];
      delete retryAttemptsRef.current[conversationId];
      adoptConversationDraftRevision(conversationId, theirsRevision, job.session);
      toast.dismiss(`draft-conflict-${conversationId}`);
      setOpenConflict(null);
      if (keep === 'mine') {
        delete lastSavedRef.current[conversationId];
        setRetryTick((current) => current + 1);
        return;
      }
      const store = useChatStore.getState();
      if (theirs) {
        store.setDraftContent(theirs, conversationId);
        writePersistedDraft(conversationId, theirs);
      } else {
        store.clearDraftContent(conversationId);
        clearPersistedDraft(conversationId);
      }
      if (job.clearToken) clearPendingDraftClear(conversationId, job.clearToken);
      const owner = useChatStore.getState().draftOwnersByConversation[conversationId]!;
      lastSavedRef.current[conversationId] = owner;
      replacementNonceRef.current += 1;
      const replacementJob = { ...job, draft: theirs, owner };
      setReplacement({
        conversationId,
        content: theirs,
        nonce: replacementNonceRef.current,
        isCurrent: () => canPublish(replacementJob),
      });
    },
    [openConflict, canPublish],
  );

  return {
    conflict: openConflict && canPublish(openConflict.job) ? openConflict : null,
    replacement: replacement?.isCurrent() ? replacement : null,
    resolveConflict,
    closeConflict,
    consumeReplacement,
  };
}

function isDraftOnScreen(conversationId: string): boolean {
  return useChatStore.getState().activeConversationId === conversationId;
}

function conversationTitle(conversationId: string): string {
  const title = useChatStore
    .getState()
    .conversations.find((candidate) => candidate.id === conversationId)
    ?.title?.trim();
  return title || 'another chat';
}
