import { isMobileIapProductKey, type MobileIapProductKey } from '@agiworkforce/types';
import { storage } from '@/lib/mmkv';

const STORAGE_KEY_PREFIX = 'billing-awaiting-approval:';

function storageKey(ownerId: string): string {
  return `${STORAGE_KEY_PREFIX}${ownerId}`;
}

export function readAwaitingApproval(ownerId: string): MobileIapProductKey[] {
  const raw = storage.getString(storageKey(ownerId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (key): key is MobileIapProductKey =>
            typeof key === 'string' && isMobileIapProductKey(key),
        )
      : [];
  } catch {
    return [];
  }
}

function write(ownerId: string, keys: readonly MobileIapProductKey[]): MobileIapProductKey[] {
  const unique = [...new Set(keys)];
  if (unique.length === 0) storage.delete(storageKey(ownerId));
  else storage.set(storageKey(ownerId), JSON.stringify(unique));
  return unique;
}

export function markAwaitingApproval(
  ownerId: string,
  key: MobileIapProductKey,
): MobileIapProductKey[] {
  return write(ownerId, [...readAwaitingApproval(ownerId), key]);
}

export function clearAwaitingApproval(
  ownerId: string,
  key: MobileIapProductKey,
): MobileIapProductKey[] {
  return write(
    ownerId,
    readAwaitingApproval(ownerId).filter((candidate) => candidate !== key),
  );
}
