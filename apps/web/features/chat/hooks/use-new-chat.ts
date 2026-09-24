'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PENDING_CONVERSATION_KEY, useChatStore } from '@shared/stores/web-chat-store';
import {
  buildNewChatHref,
  NEW_CHAT_PATH,
  parseNewChatEntry,
  QUICK_ASK_PATH,
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entry = useMemo(() => parseNewChatEntry(searchParams), [searchParams]);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!entry || appliedRef.current) return;
    appliedRef.current = true;
    const store = useChatStore.getState();
    store.setComposerToggles({ workMode: entry.workMode }, PENDING_CONVERSATION_KEY);
    if (entry.draft) store.setDraftContent(entry.draft, PENDING_CONVERSATION_KEY);
    const surfaceRoot =
      pathname === QUICK_ASK_PATH || pathname?.startsWith(`${QUICK_ASK_PATH}/`)
        ? QUICK_ASK_PATH
        : NEW_CHAT_PATH;
    router.replace(stripNewChatParams(searchParams ?? new URLSearchParams(), surfaceRoot));
  }, [entry, pathname, router, searchParams]);

  return entry;
}
