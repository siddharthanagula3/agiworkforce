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

  it('rejects and keeps the saved profile when the removal fails', async () => {
    const { local } = installChromeStub();
    await local.set({ agi_autofill_profile: { email: 'ada@example.test' } });
    vi.spyOn(local, 'remove').mockRejectedValue(new Error('Storage unavailable'));
    const { clearAutofillProfile, loadAutofillProfile } =
      await import('../src/features/content/autofill/filler');
    await expect(clearAutofillProfile()).rejects.toThrow('Storage unavailable');
    expect(await loadAutofillProfile()).toEqual({ email: 'ada@example.test' });
  });

  it('rejects when storage is unavailable', async () => {
    (globalThis as { chrome?: unknown }).chrome = undefined;
    const { clearAutofillProfile } = await import('../src/features/content/autofill/filler');
    await expect(clearAutofillProfile()).rejects.toThrow();
  });
});

describe('saved contact profile turn context', () => {
  it('reads only validated contact fields from the canonical saved profile', async () => {
    const { local } = installChromeStub();
    await local.set({
      agi_autofill_profile: {
        firstName: ' Sage ',
        lastName: 'QA',
        email: 'qa@example.test',
        currentCompany: 'Fixture Company',
        phone: 'bad\nvalue',
        workAuthorization: 'private authorization answer',
        coverLetterText: 'private letter',
        token: 'must never leave storage',
      },
    });
    const storage = await import('../src/features/content/autofill/profile-storage');
    expect('loadContactAutofillProfile' in storage).toBe(true);
    const load = Reflect.get(storage, 'loadContactAutofillProfile') as () => Promise<unknown>;
    expect(await load()).toEqual({
      firstName: 'Sage',
      lastName: 'QA',
      email: 'qa@example.test',
      currentCompany: 'Fixture Company',
    });
  });

  it('reports storage failure to an explicitly requested contact read', async () => {
    const { local } = installChromeStub();
    vi.spyOn(local, 'get').mockRejectedValue(new Error('Storage unavailable'));
    const storage = await import('../src/features/content/autofill/profile-storage');
    expect('loadContactAutofillProfile' in storage).toBe(true);
    const load = Reflect.get(storage, 'loadContactAutofillProfile') as () => Promise<unknown>;
    await expect(load()).rejects.toThrow('Storage unavailable');
    await expect(storage.loadAutofillProfile()).resolves.toEqual({});
  });
});
