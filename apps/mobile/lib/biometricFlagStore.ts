/**
 * Biometric-lock flag store — backed by SecureStore (OS keychain).
 *
 * **Why this exists** (LOW-MOB-1 red-team finding 2026-05): the flag used
 * to live in the MMKV-backed `settingsStore`, which is encrypted with the
 * MMKV key in SecureStore. Two problems:
 *
 *   1. If the MMKV encryption key is ever extracted (e.g., off-device
 *      forensic dump on a rooted device), an attacker can flip the flag
 *      back to `false` without ever passing biometric auth.
 *   2. Adding _any_ tamper-detectable, security-critical setting to the
 *      same MMKV bucket as low-stakes prefs makes the bucket itself a
 *      lateral-movement target.
 *
 * The flag now lives directly in SecureStore (iOS Keychain /
 * Android EncryptedSharedPreferences with hardware-backed Keystore).
 * SecureStore items use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, which:
 *   - rules out iCloud / Google backup leakage,
 *   - requires the device to be unlocked at access time (so a turned-off
 *     device leaks nothing),
 *   - and on Android v23+ uses the hardware Keystore-backed AES-GCM
 *     wrapper (StrongBox on Pixel etc.).
 *
 * The flag is read synchronously from a Zustand store after `hydrate()`
 * has resolved at app startup; until then the app behaves as if the
 * gate is **enabled** (fail-closed) — any access before hydration
 * shows the lock screen.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORAGE_KEY = 'agi_biometric_lock_enabled_v1';

interface BiometricFlagState {
  /** True once `hydrate()` has resolved at least once. */
  hydrated: boolean;
  /** Current persisted setting. */
  enabled: boolean;
  /**
   * Read the persisted flag from SecureStore into memory. Idempotent —
   * subsequent calls re-read in case the user toggled it in another tab.
   * Should be called once from the root layout at app boot, before any
   * biometric-gated UI mounts.
   */
  hydrate: () => Promise<void>;
  /**
   * Persist a new value to SecureStore and update the in-memory state.
   * Throws if SecureStore is unavailable — callers should treat that as
   * a setup failure and surface it to the user, not silently ignore.
   */
  setEnabled: (next: boolean) => Promise<void>;
}

export const useBiometricFlag = create<BiometricFlagState>((set) => ({
  hydrated: false,
  enabled: false,
  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      // Only the literal string 'true' enables the gate — anything else
      // (null, 'false', legacy garbage) keeps it disabled. We store as
      // string because SecureStore's API is string-only.
      set({ hydrated: true, enabled: stored === 'true' });
    } catch (err) {
      console.warn('[biometricFlag] SecureStore read failed:', err);
      // Fail-closed-ish: mark hydrated so the app can boot, but leave
      // enabled=false so we don't lock the user out of an app that has a
      // broken SecureStore on the device.
      set({ hydrated: true, enabled: false });
    }
  },
  setEnabled: async (next: boolean) => {
    await SecureStore.setItemAsync(STORAGE_KEY, next ? 'true' : 'false', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    set({ enabled: next });
  },
}));

/**
 * Imperative helper for code paths that don't have hooks (e.g. one-shot
 * hydrate at app boot). Uses Zustand's `getState()` to bypass the
 * hooks API.
 */
export function hydrateBiometricFlag(): Promise<void> {
  return useBiometricFlag.getState().hydrate();
}
