export interface NoticeStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const chromeNoticeStore: NoticeStore = {
  async get(key) {
    const items = await chrome.storage.local.get(key);
    return items[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

// The stored list holds a fingerprint of each account, not its id, so whoever
// uses this Chrome profile later cannot read which accounts used it.
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

async function shownFingerprints(store: NoticeStore, storageKey: string): Promise<string[]> {
  let stored: unknown;
  try {
    stored = await store.get(storageKey);
  } catch {
    return [];
  }
  return Array.isArray(stored)
    ? stored.filter((value): value is string => typeof value === 'string')
    : [];
}

export async function claimFirstShowing(
  store: NoticeStore,
  storageKey: string,
  accountId: string,
): Promise<boolean> {
  const shown = await shownFingerprints(store, storageKey);
  const fingerprint = accountFingerprint(storageKey, accountId);
  if (shown.includes(fingerprint)) return false;
  try {
    await store.set(storageKey, [...shown, fingerprint]);
  } catch {
    // A refused write brings the notice back next time, the safe direction for a disclosure.
  }
  return true;
}
