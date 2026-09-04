import { getItem, removeItem, setItem } from '@shared/utils/localStorage';

// `agi-` matches APP_STORAGE_KEY_PATTERNS in shared/stores/authentication-store.ts,
// so cleanupAllStores() purges this key on sign-out without any extra wiring here.
const CURSOR_STORAGE_PREFIX = 'agi-chat-artifact-sync-cursor';
export const INITIAL_ARTIFACT_SYNC_CURSOR = '0';

function cursorStorageKey(userId: string): string {
  const origin = typeof window === 'undefined' ? 'ssr' : window.location.origin;
  return `${CURSOR_STORAGE_PREFIX}:${origin}:${userId}`;
}

export function readArtifactSyncCursor(userId: string): string {
  return getItem(cursorStorageKey(userId), INITIAL_ARTIFACT_SYNC_CURSOR);
}

export function writeArtifactSyncCursor(userId: string, cursor: string): void {
  setItem(cursorStorageKey(userId), cursor);
}

export function clearArtifactSyncCursor(userId: string): void {
  removeItem(cursorStorageKey(userId));
}
