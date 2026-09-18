import { getItem, removeItem, setItem } from '@shared/utils/localStorage';

/**
 * The in-memory draft store and `pending-composer-draft` between them cover
 * every move the user makes inside one document: a soft navigation keeps the
 * store, a history step replays the parked text. `use-conversation-draft-sync`
 * then carries the store's map to the conversation row, which is what reaches
 * the user's other devices and is authoritative between them.
 *
 * All three fill only when the composer unmounts, so none of them holds a
 * keystroke that was never navigated away from, and a refresh or a crash takes
 * exactly that. This writes as the user types instead. It is a local crash
 * copy, not a second owner: the mount prefers the store's draft whenever there
 * is one, so a draft typed on another device still wins.
 *
 * The record shape mirrors `apps/mobile/src/features/chat/draftStore.ts`: a
 * version, the text, and an empty draft stored as the absence of a key. The
 * `agi-` prefix is what makes sign-out reap it, see APP_STORAGE_KEY_PATTERNS
 * in shared/stores/authentication-store.ts.
 */
const DRAFT_STORAGE_PREFIX = 'agi-composer-draft';
const DRAFT_RECORD_VERSION = 1;
const NEW_CHAT_DRAFT_KEY = 'new-chat';

interface StoredDraftRecord {
  version: number;
  text: string;
}

function draftStorageKey(conversationId: string | null): string {
  const scope = encodeURIComponent(conversationId ?? NEW_CHAT_DRAFT_KEY);
  return `${DRAFT_STORAGE_PREFIX}:v${DRAFT_RECORD_VERSION}:${scope}`;
}

export function readPersistedDraft(conversationId: string | null): string {
  const record = getItem<StoredDraftRecord | null>(draftStorageKey(conversationId), null);
  if (!record || record.version !== DRAFT_RECORD_VERSION || typeof record.text !== 'string') {
    return '';
  }
  return record.text;
}

/** @returns `false` when the draft did not reach storage, see {@link setItem}. */
export function writePersistedDraft(conversationId: string | null, text: string): boolean {
  const key = draftStorageKey(conversationId);
  if (!text.trim()) {
    removeItem(key);
    return true;
  }
  return setItem<StoredDraftRecord>(key, { version: DRAFT_RECORD_VERSION, text });
}

export function clearPersistedDraft(conversationId: string | null): void {
  removeItem(draftStorageKey(conversationId));
}

/**
 * Every new chat shares the unsaved surface's one draft slot, so restoring it
 * on any mount would hand the previous new chat's text to the next one, which
 * is the rule `pending-composer-draft` exists to hold. A document load is the
 * one arrival that is neither a push nor a pop: the user is returning to where
 * they were interrupted. Module scope is per document, so the first composer
 * to mount on the unsaved surface after a load claims the draft and every
 * mount after it, all of them soft navigations, gets nothing.
 */
let reloadedPendingDraftClaimed = false;

export function claimReloadedPendingDraft(): string {
  if (reloadedPendingDraftClaimed) return '';
  reloadedPendingDraftClaimed = true;
  return readPersistedDraft(null);
}
