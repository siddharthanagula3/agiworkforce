import { getItem, removeItem, setItem } from '@shared/utils/localStorage';

const PREFIX = 'agi-composer-draft-clear:v1:';
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

interface PendingClear {
  clearedAt: number;
}

function key(conversationId: string): string {
  return `${PREFIX}${encodeURIComponent(conversationId)}`;
}

export function markPendingDraftClear(conversationId: string): boolean {
  return setItem<PendingClear>(key(conversationId), { clearedAt: Date.now() });
}

export function hasPendingDraftClear(conversationId: string): boolean {
  const record = getItem<PendingClear | null>(key(conversationId), null);
  if (
    !record ||
    typeof record.clearedAt !== 'number' ||
    !Number.isFinite(record.clearedAt) ||
    record.clearedAt > Date.now() ||
    Date.now() - record.clearedAt > MAX_AGE_MS
  ) {
    removeItem(key(conversationId));
    return false;
  }
  return true;
}

export function clearPendingDraftClear(conversationId: string): void {
  removeItem(key(conversationId));
}
