// A notice's stored value is the account that acknowledged it, so a second
// account on the same browser is still shown it once, and a signed-out visitor
// is not treated as having seen it.
export function readAcknowledgedAccount(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function rememberAcknowledgedAccount(storageKey: string, accountId: string): void {
  try {
    window.localStorage.setItem(storageKey, accountId);
  } catch {
    // Storage refused the write. The notice is acknowledged for this session and
    // returns on the next visit, which is the safe direction for a disclosure.
  }
}
