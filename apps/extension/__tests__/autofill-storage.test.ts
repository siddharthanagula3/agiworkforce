/**
 * Storage-migration tests for the autofill profile (H-04 promoted Critical).
 *
 * The profile previously lived in chrome.storage.sync, which replicates to
 * Google's servers. We moved it to chrome.storage.local and added a one-shot
 * migrator. These tests stub both storage areas and validate:
 *   1. Reads come from local.
 *   2. Writes go to local.
 *   3. Migration runs once, copies sync → local, clears sync, sets a marker.
 *   4. Migration is idempotent.
 *   5. Migration does not clobber an existing local profile.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobApplicationProfile } from '../src/types';

// ─── chrome.storage stub ────────────────────────────────────────────────────

interface StorageArea {
  store: Record<string, unknown>;
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
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
    async remove(key: string): Promise<void> {
      delete store[key];
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('autofill profile storage — H-04', () => {
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

describe('migrateAutofillProfile — H-04', () => {
  it('copies a profile from sync into local on first run', async () => {
    const { local, sync } = installChromeStub();
    const legacy: JobApplicationProfile = { firstName: 'Grace', email: 'gh@x' };
    await sync.set({ agi_autofill_profile: legacy });
    const { migrateAutofillProfile } = await import('../src/features/content/autofill/filler');
    const copied = await migrateAutofillProfile();
    expect(copied).toBe(true);
    expect(local.store['agi_autofill_profile']).toEqual(legacy);
    expect(local.store['agi_autofill_profile_migrated']).toBe(true);
  });

  it('clears the sync key after migration so future syncs do not re-replicate', async () => {
    const { sync } = installChromeStub();
    await sync.set({ agi_autofill_profile: { email: 'g@x' } });
    const { migrateAutofillProfile } = await import('../src/features/content/autofill/filler');
    await migrateAutofillProfile();
    expect(sync.store['agi_autofill_profile']).toBeUndefined();
  });

  it('is idempotent — second call is a no-op', async () => {
    const { local, sync } = installChromeStub();
    await sync.set({ agi_autofill_profile: { email: 'first@x' } });
    const { migrateAutofillProfile } = await import('../src/features/content/autofill/filler');
    expect(await migrateAutofillProfile()).toBe(true);

    // Simulate a stray sync write after migration (e.g. an older client).
    await sync.set({ agi_autofill_profile: { email: 'should-not-copy@x' } });
    expect(await migrateAutofillProfile()).toBe(false);
    expect((local.store['agi_autofill_profile'] as { email?: string })?.email).toBe('first@x');
  });

  it('does NOT clobber an existing local profile when sync also has one', async () => {
    const { local, sync } = installChromeStub();
    const localProfile: JobApplicationProfile = { email: 'local@x' };
    const syncProfile: JobApplicationProfile = { email: 'sync@x' };
    await local.set({ agi_autofill_profile: localProfile });
    await sync.set({ agi_autofill_profile: syncProfile });
    const { migrateAutofillProfile } = await import('../src/features/content/autofill/filler');
    const copied = await migrateAutofillProfile();
    expect(copied).toBe(false); // local non-empty, no copy
    expect(local.store['agi_autofill_profile']).toEqual(localProfile);
    // Sync key still gets cleared so future client writes can't replicate.
    expect(sync.store['agi_autofill_profile']).toBeUndefined();
  });

  it('returns false silently when sync has nothing to migrate', async () => {
    installChromeStub();
    const { migrateAutofillProfile } = await import('../src/features/content/autofill/filler');
    expect(await migrateAutofillProfile()).toBe(false);
  });
});
