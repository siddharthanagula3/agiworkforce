/**
 * MMKV storage with at-rest encryption.
 *
 * The encryption key is generated once (using expo-crypto), stored in the OS
 * keychain via expo-secure-store, and reused on every subsequent app launch.
 * Call `initMmkvEncryption()` at app startup (before any store access) to
 * populate the key; until that completes the storage operates in a safe
 * "not yet initialised" state where reads return null.
 *
 * Key storage characteristics:
 *   iOS  — Keychain, kSecAttrAccessibleWhenUnlockedThisDeviceOnly
 *   Android — EncryptedSharedPreferences (Keystore-backed)
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const MMKV_KEY_STORAGE_ID = 'agi_mmkv_encryption_key_v1';
const MMKV_INSTANCE_ID = 'agiworkforce-mobile';

/** Module-level singleton — replaced with an encrypted instance by initMmkvEncryption(). */
let _storage: MMKV | null = null;

/**
 * Lazily get the MMKV instance.
 * If encryption has not been initialised yet (first JS frame before the async
 * init completes) a no-op proxy is returned so callers degrade gracefully
 * rather than crashing the app at startup.
 */
function getStorage(): MMKV {
  if (!_storage) {
    console.warn('[mmkv] Storage not yet initialized, returning no-op');
    return new Proxy({} as MMKV, {
      get: () => () => undefined,
    });
  }
  return _storage;
}

/**
 * Initialise (or re-use) the encrypted MMKV instance.
 *
 * Must be called once, early in app startup (e.g. the very first `useEffect`
 * in the root `_layout.tsx`), before any Zustand store that uses `mmkvStorage`
 * is accessed.
 *
 * Idempotent — safe to call multiple times; subsequent calls are no-ops.
 */
export async function initMmkvEncryption(): Promise<void> {
  if (_storage) return; // already initialised

  // Retrieve or create the per-device encryption key.
  let key = await SecureStore.getItemAsync(MMKV_KEY_STORAGE_ID);

  if (!key) {
    // Generate a cryptographically random 64-char hex key (256 bits).
    const uuid1 = Crypto.randomUUID(); // 36 chars
    const uuid2 = Crypto.randomUUID(); // 36 chars
    key = (uuid1 + uuid2).replace(/-/g, ''); // 64 hex chars

    await SecureStore.setItemAsync(MMKV_KEY_STORAGE_ID, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  _storage = new MMKV({ id: MMKV_INSTANCE_ID, encryptionKey: key });
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

/**
 * Zustand-compatible StateStorage adapter for MMKV.
 * ~30x faster than AsyncStorage; data is encrypted at rest on disk.
 */
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
