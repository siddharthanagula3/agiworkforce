import { useCallback, useEffect, useRef, useState } from 'react';

// A notice's stored value lists a fingerprint of each account it has been shown
// to, so each account on a browser sees it once, a signed-out visitor never
// counts as having seen it, and whoever uses the browser later cannot read
// which accounts did. The fingerprint is not a secret, only not the id.
function accountFingerprint(storageKey: string, accountId: string): string {
  const input = `${storageKey}\u0000${accountId}`;
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return (4294967296 * (2097151 & low) + (high >>> 0)).toString(36);
}

interface ShownRecord {
  fingerprints: string[];
  legacyAccountId: string | null;
}

const NOTHING_SHOWN: ShownRecord = { fingerprints: [], legacyAccountId: null };

function readShown(storageKey: string): ShownRecord {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    return NOTHING_SHOWN;
  }
  if (!stored) return NOTHING_SHOWN;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return {
        fingerprints: parsed.filter((value): value is string => typeof value === 'string'),
        legacyAccountId: null,
      };
    }
  } catch {
    // A value written before the list existed holds one account id as is.
  }
  return { fingerprints: [], legacyAccountId: stored };
}

export function wasShownTo(storageKey: string, accountId: string): boolean {
  const { fingerprints, legacyAccountId } = readShown(storageKey);
  return (
    legacyAccountId === accountId ||
    fingerprints.includes(accountFingerprint(storageKey, accountId))
  );
}

export function rememberShownTo(storageKey: string, accountId: string): void {
  const { fingerprints, legacyAccountId } = readShown(storageKey);
  const fingerprint = accountFingerprint(storageKey, accountId);
  if (legacyAccountId === null && fingerprints.includes(fingerprint)) return;
  const shown = new Set(fingerprints);
  if (legacyAccountId !== null) shown.add(accountFingerprint(storageKey, legacyAccountId));
  shown.add(fingerprint);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...shown]));
  } catch {
    // Storage refused the write. The notice returns on the next visit, which is
    // the safe direction for a disclosure.
  }
}

/**
 * Shows a notice the first time an account meets it on this browser and
 * records that at once, so later visits start without it. The decision is
 * taken once per key and account, so a development double effect cannot hide a
 * notice before it was seen.
 */
export function useShownOnceNotice(
  storageKey: string | null,
  accountId: string | null,
): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  const decided = useRef<string | null>(null);

  useEffect(() => {
    if (!storageKey || !accountId) {
      decided.current = null;
      setVisible(false);
      return;
    }
    const decision = `${storageKey} ${accountId}`;
    if (decided.current === decision) return;
    decided.current = decision;
    setVisible(!wasShownTo(storageKey, accountId));
    rememberShownTo(storageKey, accountId);
  }, [storageKey, accountId]);

  const dismiss = useCallback(() => setVisible(false), []);
  return { visible, dismiss };
}
