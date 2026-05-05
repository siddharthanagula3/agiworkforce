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
 * Generate a 256-bit MMKV encryption key as 64 lowercase hex chars.
 *
 * **Why this is a separate, exported function** (CRIT-MOB-02 fix, 2026-05):
 * the previous implementation concatenated two `Crypto.randomUUID()` calls
 * and stripped dashes:
 *
 *   const uuid1 = Crypto.randomUUID();  // 36 chars, 122 bits of entropy
 *   const uuid2 = Crypto.randomUUID();  // 36 chars, 122 bits of entropy
 *   key = (uuid1 + uuid2).replace(/-/g, ''); // 64 hex chars, 244 bits effective
 *
 * Each RFC 4122 v4 UUID encodes only 122 bits of entropy (4 bits go to the
 * version field, 2 bits go to the variant field, both fixed). Concatenating
 * two yields 244 bits of entropy in a 256-bit-shaped string — the visible
 * key shape suggests stronger material than is actually present, and the
 * fixed-bit pattern is a distinguisher in pathological cracking scenarios.
 *
 * `Crypto.getRandomBytesAsync(32)` returns 32 raw random bytes from the
 * platform CSPRNG — the actual primitive. Hex-encode for storage as a
 * string; `react-native-mmkv` accepts the hex string directly as
 * `encryptionKey`. Result: a true 256-bit key with no fixed-bit overhead.
 *
 * Exported separately so unit tests can pin the format without spinning
 * up a real `SecureStore`.
 */
export async function generateMmkvEncryptionKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32); // 256 bits, raw
  // Manual hex encoding — Buffer is not available in Hermes / RN runtimes.
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    out += b.toString(16).padStart(2, '0');
  }
  return out;
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
    key = await generateMmkvEncryptionKey();

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
