import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobApplicationProfile } from '../src/types';

interface StorageArea {
  store: Record<string, unknown>;
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function makeStorageArea(): StorageArea {
  const store: Record<string, unknown> = {};
  return {
    store,
    async get(keys: string | string[]): Promise<Record<string, unknown>> {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (k in store) out[k] = store[k];
      }
      return out;
    },
    async set(items: Record<string, unknown>): Promise<void> {
      Object.assign(store, items);
    },
    async remove(keys: string | string[]): Promise<void> {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    },
  };
}

function installChromeStub(): { local: StorageArea; sync: StorageArea } {
  const local = makeStorageArea();
  const sync = makeStorageArea();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { local, sync },
  };
  return { local, sync };
}

beforeEach(() => {
  vi.resetModules();
});

describe('autofill profile storage, H-04', () => {
  it('loadAutofillProfile reads from chrome.storage.local', async () => {
    const { local } = installChromeStub();
    const profile: JobApplicationProfile = { firstName: 'Ada', lastName: 'Lovelace' };
    await local.set({ agi_autofill_profile: profile });
    const { loadAutofillProfile } = await import('../src/features/content/autofill/filler');
    expect(await loadAutofillProfile()).toEqual(profile);
  });

  it('saveAutofillProfile writes to chrome.storage.local, not sync', async () => {
    const { local, sync } = installChromeStub();
    const profile: JobApplicationProfile = { email: 'a@b.com' };
    const { saveAutofillProfile } = await import('../src/features/content/autofill/filler');
    await saveAutofillProfile(profile);
    expect(local.store['agi_autofill_profile']).toEqual(profile);
    expect(sync.store['agi_autofill_profile']).toBeUndefined();
  });

  it('returns empty object when no profile is set anywhere', async () => {
    installChromeStub();
    const { loadAutofillProfile } = await import('../src/features/content/autofill/filler');
    expect(await loadAutofillProfile()).toEqual({});
  });
});

describe('clearAutofillProfile, SEC-49 erasure path', () => {
  it('removes the identity and employment profile from chrome.storage.local', async () => {
    const { local } = installChromeStub();
    const profile: JobApplicationProfile = {
      firstName: 'Ada',
      email: 'ada@example.test',
      currentCompany: 'Analytical Engines',
    };
    await local.set({ agi_autofill_profile: profile });
    const { clearAutofillProfile } = await import('../src/features/content/autofill/filler');
    await clearAutofillProfile();
    expect(local.store['agi_autofill_profile']).toBeUndefined();
  });

  it('resolves without throwing when storage is unavailable', async () => {
    (globalThis as { chrome?: unknown }).chrome = undefined;
    const { clearAutofillProfile } = await import('../src/features/content/autofill/filler');
    await expect(clearAutofillProfile()).resolves.toBeUndefined();
  });
});
