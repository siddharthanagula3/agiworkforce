import { getItem, removeItem, setItem } from '@shared/utils/localStorage';

const PREFIX = 'agi-composer-draft-clear:v1:';
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

interface PendingClear {
  clearedAt: number;
  markerId?: string;
}

function key(conversationId: string): string {
  return `${PREFIX}${encodeURIComponent(conversationId)}`;
}

export function markPendingDraftClear(conversationId: string): boolean {
  try {
    return setItem<PendingClear>(key(conversationId), {
      clearedAt: Date.now(),
      markerId: crypto.randomUUID(),
    });
  } catch {
    return false;
  }
}

export function readPendingDraftClearToken(conversationId: string): string | null {
  const record = getItem<PendingClear | null>(key(conversationId), null);
  if (
    !record ||
    typeof record.clearedAt !== 'number' ||
    !Number.isFinite(record.clearedAt) ||
    record.clearedAt > Date.now() ||
    Date.now() - record.clearedAt > MAX_AGE_MS
  ) {
    removeItem(key(conversationId));
    return null;
  }
  return JSON.stringify(record);
}

export function hasPendingDraftClear(conversationId: string): boolean {
  return readPendingDraftClearToken(conversationId) !== null;
}

export function clearPendingDraftClear(conversationId: string, expectedToken?: string): void {
  if (expectedToken !== undefined && readPendingDraftClearToken(conversationId) !== expectedToken) {
    return;
  }
  removeItem(key(conversationId));
}
