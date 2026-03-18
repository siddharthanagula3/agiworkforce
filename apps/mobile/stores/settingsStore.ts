import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import type { AutoApproveMode } from '@/types/chat';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontPreference = 'default' | 'system' | 'dyslexic';

interface SettingsState {
  /** Auto-approve mode for tool execution */
  autoApproveMode: AutoApproveMode;
  /** Enable haptic feedback */
  hapticsEnabled: boolean;
  /** Enable push notifications */
  notificationsEnabled: boolean;
  /** Enable voice features */
  voiceEnabled: boolean;
  /** Enable background fetch for agent status polling */
  backgroundFetchEnabled: boolean;
  /** Theme mode: dark, light, or follow system */
  themeMode: ThemeMode;
  /** Font preference */
  fontPreference: FontPreference;
  /** Require biometric auth on app launch */
  biometricLockEnabled: boolean;
  /** Selected TTS voice identifier (null = system default) */
  selectedVoiceId: string | null;
  /** TTS speech rate: 0.5 = half speed, 1.0 = normal, 2.0 = double */
  speechRate: number;

  setAutoApproveMode: (mode: AutoApproveMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBackgroundFetchEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setFontPreference: (pref: FontPreference) => void;
  setBiometricLockEnabled: (enabled: boolean) => void;
  setSelectedVoiceId: (voiceId: string | null) => void;
  setSpeechRate: (rate: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoApproveMode: 'ask',
      hapticsEnabled: true,
      notificationsEnabled: true,
      voiceEnabled: true,
      backgroundFetchEnabled: true,
      themeMode: 'dark',
      fontPreference: 'default',
      biometricLockEnabled: false,
      selectedVoiceId: null,
      speechRate: 1.0,

      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setBackgroundFetchEnabled: (enabled) => set({ backgroundFetchEnabled: enabled }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setFontPreference: (pref) => set({ fontPreference: pref }),
      setBiometricLockEnabled: (enabled) => set({ biometricLockEnabled: enabled }),
      setSelectedVoiceId: (voiceId) => set({ selectedVoiceId: voiceId }),
      setSpeechRate: (rate) => set({ speechRate: rate }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
