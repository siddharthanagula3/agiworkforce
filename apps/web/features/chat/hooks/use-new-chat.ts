'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PENDING_CONVERSATION_KEY, useChatStore } from '@shared/stores/web-chat-store';
import {
  buildNewChatHref,
  parseNewChatEntry,
  stripNewChatParams,
  type NewChatEntry,
} from '../lib/new-chat-entry';

export function useStartNewChat(): (entry?: Partial<NewChatEntry>) => void {
  const router = useRouter();
  return useCallback(
    (entry?: Partial<NewChatEntry>) => router.push(buildNewChatHref(entry)),
    [router],
  );
}

/**
 * Applies a new-chat deep link to the pending composer exactly once, then drops
 * the parameters so a reload or a back-navigation does not re-prefill a draft
 * the user already sent or cleared.
 */
export function useNewChatEntry(): NewChatEntry | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entry = useMemo(() => parseNewChatEntry(searchParams), [searchParams]);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!entry || appliedRef.current) return;
    appliedRef.current = true;
    const store = useChatStore.getState();
    store.setComposerToggles({ workMode: entry.workMode }, PENDING_CONVERSATION_KEY);
    if (entry.draft) store.setDraftContent(entry.draft, PENDING_CONVERSATION_KEY);
    router.replace(stripNewChatParams(searchParams ?? new URLSearchParams()));
  }, [entry, router, searchParams]);

  return entry;
}
