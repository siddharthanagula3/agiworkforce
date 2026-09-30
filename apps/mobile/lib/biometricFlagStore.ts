import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'agi_biometric_lock_enabled_v1';
const PROMPTED_KEY = 'agi_biometric_lock_prompted_v1';

interface BiometricFlagState {
  hydrated: boolean;
  enabled: boolean;
  prompted: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (next: boolean) => Promise<void>;
  markPrompted: () => Promise<void>;
}

export const useBiometricFlag = create<BiometricFlagState>((set) => ({
  hydrated: false,
  enabled: true,
  prompted: false,
  hydrate: async () => {
    try {
      const [stored, prompted] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEY),
        SecureStore.getItemAsync(PROMPTED_KEY),
      ]);
      set({ hydrated: true, enabled: stored === 'true', prompted: prompted === 'true' });
    } catch (err) {
      console.warn('[biometricFlag] SecureStore read failed:', err);
      set({ hydrated: true, enabled: true, prompted: true });
    }
  },
  setEnabled: async (next: boolean) => {
    await SecureStore.setItemAsync(STORAGE_KEY, next ? 'true' : 'false', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    set({ enabled: next });
  },
  markPrompted: async () => {
    await SecureStore.setItemAsync(PROMPTED_KEY, 'true', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    set({ prompted: true });
  },
}));

export function hydrateBiometricFlag(): Promise<void> {
  return useBiometricFlag.getState().hydrate();
}

export async function clearBiometricFlag(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    await SecureStore.deleteItemAsync(PROMPTED_KEY);
  } catch (err) {
    console.warn('[biometricFlag] SecureStore delete failed:', err);
  } finally {
    useBiometricFlag.setState({ hydrated: true, enabled: false, prompted: false });
  }
}
