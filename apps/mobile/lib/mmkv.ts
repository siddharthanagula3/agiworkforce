import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const MMKV_KEY_STORAGE_ID = 'agi_mmkv_encryption_key_v1';
const MMKV_INSTANCE_ID = 'agiworkforce-mobile';

let _storage: MMKV | null = null;

type MmkvReadyCallback = () => void | Promise<void>;
let readyCallbacks: MmkvReadyCallback[] = [];

function observeReadyCallback(result: void | Promise<void>): void {
  if (result && typeof result.catch === 'function') {
    result.catch((err) => {
      console.warn('[mmkv] whenMmkvReady async callback rejected:', err);
    });
  }
}

export function whenMmkvReady(cb: MmkvReadyCallback): void {
  if (_storage) {
    try {
      observeReadyCallback(cb());
    } catch (err) {
      console.warn('[mmkv] whenMmkvReady callback threw:', err);
    }
    return;
  }
  readyCallbacks.push(cb);
}

function getStorage(): MMKV {
  if (!_storage) {
    return new Proxy({} as MMKV, {
      get: () => () => undefined,
    });
  }
  return _storage;
}

export async function generateMmkvEncryptionKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

export async function initMmkvEncryption(): Promise<void> {
  if (_storage) return;

  let key = await SecureStore.getItemAsync(MMKV_KEY_STORAGE_ID);

  if (!key) {
    key = await generateMmkvEncryptionKey();

    await SecureStore.setItemAsync(MMKV_KEY_STORAGE_ID, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  _storage = new MMKV({ id: MMKV_INSTANCE_ID, encryptionKey: key });

  const queued = readyCallbacks;
  readyCallbacks = [];
  for (const cb of queued) {
    try {
      await cb();
    } catch (err) {
      console.warn('[mmkv] whenMmkvReady callback threw:', err);
    }
  }
}

/**
 * Direct access to the underlying MMKV instance.
 * Exported for the rare cases (e.g. onboarding flag read in _layout.tsx) where
 * the Zustand adapter is not used. Always call `initMmkvEncryption()` first.
 */
export const storage = new Proxy({} as MMKV, {
  get(_target, prop) {
    return getStorage()[prop as keyof MMKV];
  },
});

export const mmkvStorage: StateStorage = {
  getItem: (name: string) => {
    const value = getStorage().getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    getStorage().set(name, value);
  },
  removeItem: (name: string) => {
    getStorage().delete(name);
  },
};

/**
 * Shared MMKV-race helper for Zustand persist stores.
 *
 * Persist-enabled stores must defer `persist.rehydrate()` until the encrypted
 * MMKV instance is ready. This helper consolidates that pattern so:
 *   1. New stores opt in via one call, not three lines.
 *   2. Structured logging / metrics around rehydration timing have one place
 *      to change.
 *   3. The shape `{ persist: { rehydrate(): Promise<void> | void } }` is
 *      enforced statically rather than via duck-typing.
 *
 * Use this in new persist-enabled stores; existing call sites can migrate
 * opportunistically.
 */
export interface RehydratableStore {
  persist: {
    rehydrate: () => Promise<void> | void;
  };
}

export function rehydrateWhenMmkvReady(store: RehydratableStore, storeName: string): void {
  whenMmkvReady(() => {
    try {
      const result = store.persist.rehydrate();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        return (result as Promise<void>).catch((err) => {
          console.warn(`[mmkv] ${storeName} async rehydrate failed:`, err);
        });
      }
    } catch (err) {
      console.warn(`[mmkv] ${storeName} sync rehydrate threw:`, err);
    }
  });
}
