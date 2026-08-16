import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'agi_biometric_lock_enabled_v1';

interface BiometricFlagState {
  hydrated: boolean;
  enabled: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (next: boolean) => Promise<void>;
}

export const useBiometricFlag = create<BiometricFlagState>((set) => ({
  hydrated: false,
  enabled: true,
  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      set({ hydrated: true, enabled: stored === 'true' });
    } catch (err) {
      console.warn('[biometricFlag] SecureStore read failed:', err);
      set({ hydrated: true, enabled: true });
    }
  },
  setEnabled: async (next: boolean) => {
    await SecureStore.setItemAsync(STORAGE_KEY, next ? 'true' : 'false', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    set({ enabled: next });
  },
}));

export function hydrateBiometricFlag(): Promise<void> {
  return useBiometricFlag.getState().hydrate();
}

export async function clearBiometricFlag(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch (err) {
    console.warn('[biometricFlag] SecureStore delete failed:', err);
  } finally {
    useBiometricFlag.setState({ hydrated: true, enabled: false });
  }
}
