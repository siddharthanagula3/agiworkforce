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

/**
 * MOB-3 (audit 2026-05-03): the previous setItem was fire-and-forget,
 * silently logging SecureStore failures. Zustand's persist middleware
 * relies on the returned promise resolving; without that, a failed
 * auth-token write (quota exceeded, keychain locked at first-boot
 * race) is dropped on the floor. On next cold start `getItem`
 * returns null, the user is signed out, and any pending agentic
 * tasks are interrupted. Worse, a failure during a token-refresh
 * cycle silently downgrades the persisted token to the prior
 * (possibly expired) value. We now return the promise so Zustand can
 * propagate the rejection, AND wrap getItem/removeItem the same way.
 */
export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(sanitizeKey(name));
    } catch (err) {
      // MOB-4 (audit 2026-05-03): on iOS the keychain is unavailable
      // in the Before-First-Unlock state (immediately after reboot
      // before PIN entry). Returning null treats this as "no
      // session" — better than throwing, which would crash the
      // persist hydration. Surface a console warning so a
      // device-unlock prompt can be wired in a follow-up.
      console.warn('[secureStorage] read failed (likely Before-First-Unlock):', err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    // WHEN_UNLOCKED_THIS_DEVICE_ONLY: value is never transferred to iCloud
    // backup and is only accessible while the device is unlocked.
    await SecureStore.setItemAsync(sanitizeKey(name), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(sanitizeKey(name));
    } catch (err) {
      // Removal failures aren't security-critical — log and continue.
      console.warn('[secureStorage] remove failed:', err);
    }
  },
};
