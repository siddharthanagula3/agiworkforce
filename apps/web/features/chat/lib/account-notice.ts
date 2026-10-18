import { useCallback, useEffect, useRef, useState } from 'react';
import { noticeAccountFingerprint } from '@agiworkforce/compliance';

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
    fingerprints.includes(noticeAccountFingerprint(storageKey, accountId))
  );
}

export function rememberShownTo(storageKey: string, accountId: string): void {
  const { fingerprints, legacyAccountId } = readShown(storageKey);
  const fingerprint = noticeAccountFingerprint(storageKey, accountId);
  if (legacyAccountId === null && fingerprints.includes(fingerprint)) return;
  const shown = new Set(fingerprints);
  if (legacyAccountId !== null) shown.add(noticeAccountFingerprint(storageKey, legacyAccountId));
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
