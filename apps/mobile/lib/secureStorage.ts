/**
 * Secure storage adapter using expo-secure-store.
 *
 * Uses the OS keychain (iOS Keychain / Android Keystore) to encrypt values at
 * rest. Use this for any store that persists auth tokens or other secrets.
 *
 * For performance-sensitive, non-sensitive data use mmkvStorage instead.
 */
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * expo-secure-store requires keys to match [A-Za-z0-9._-].
 * Zustand uses the store name as the key, which is safe, but we sanitize
 * just in case to avoid runtime errors.
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export const secureStorage: StateStorage = {
  getItem: (name: string): string | null => {
    // SecureStore.getItemAsync is async; Zustand's persist middleware accepts
    // both sync and async getItem. Return the promise directly.
    return SecureStore.getItemAsync(sanitizeKey(name)) as unknown as string | null;
  },
  setItem: (name: string, value: string): void => {
    // Fire-and-forget — errors are logged but don't crash the store.
    // WHEN_UNLOCKED_THIS_DEVICE_ONLY: value is never transferred to iCloud
    // backup and is only accessible while the device is unlocked.
    SecureStore.setItemAsync(sanitizeKey(name), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch((err) => {
      console.error('[secureStorage] Failed to persist to secure store:', err);
    });
  },
  removeItem: (name: string): void => {
    SecureStore.deleteItemAsync(sanitizeKey(name)).catch((err) => {
      console.error('[secureStorage] Failed to remove from secure store:', err);
    });
  },
};
