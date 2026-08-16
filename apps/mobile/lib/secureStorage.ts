import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(sanitizeKey(name));
    } catch (err) {
      console.warn('[secureStorage] read failed (likely Before-First-Unlock):', err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(sanitizeKey(name), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(sanitizeKey(name));
    } catch (err) {
      console.warn('[secureStorage] remove failed:', err);
    }
  },
};
