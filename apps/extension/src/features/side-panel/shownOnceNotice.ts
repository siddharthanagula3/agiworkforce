import { noticeAccountFingerprint } from '@agiworkforce/compliance';

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
  const fingerprint = noticeAccountFingerprint(storageKey, accountId);
  if (shown.includes(fingerprint)) return false;
  try {
    await store.set(storageKey, [...shown, fingerprint]);
  } catch {
    // A refused write brings the notice back next time, the safe direction for a disclosure.
  }
  return true;
}
