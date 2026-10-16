import { useCallback, useEffect, useRef, useState } from 'react';

// A notice's stored value lists the accounts it has been shown to, so each
// account on a browser sees it once and a signed-out visitor never counts as
// having seen it.
function shownAccounts(storageKey: string): string[] {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    return [];
  }
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    // A value written before the list existed holds one account id as is.
  }
  return [stored];
}

export function wasShownTo(storageKey: string, accountId: string): boolean {
  return shownAccounts(storageKey).includes(accountId);
}

export function rememberShownTo(storageKey: string, accountId: string): void {
  const accounts = shownAccounts(storageKey);
  if (accounts.includes(accountId)) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...accounts, accountId]));
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
    const seen = wasShownTo(storageKey, accountId);
    setVisible(!seen);
    if (!seen) rememberShownTo(storageKey, accountId);
  }, [storageKey, accountId]);

  const dismiss = useCallback(() => setVisible(false), []);
  return { visible, dismiss };
}
