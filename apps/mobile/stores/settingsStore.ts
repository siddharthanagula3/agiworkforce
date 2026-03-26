import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import type { AutoApproveMode } from '@/types/chat';

export type ThemeMode = 'dark' | 'light' | 'system';
export type FontPreference = 'default' | 'system' | 'dyslexic';
export type TTSProvider = 'system' | 'cloud';

interface Personalization {
  fullName: string;
  nickname: string;
  occupation: string;
  instructions: string;
  warmth: number;
  enthusiasm: number;
  headersLists: number;
  emoji: number;
}

interface Capabilities {
  webSearch: boolean;
  imageGen: boolean;
  memory: boolean;
  desktopControl: boolean;
}

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
  /** TTS speech pitch: 0.5 = low, 1.0 = normal, 2.0 = high */
  speechPitch: number;
  /** Selected branded voice preset ID (null = no preset / custom) */
  selectedPresetId: string | null;
  /** TTS provider: system (free) or cloud (premium) */
  ttsProvider: TTSProvider;
  /** Auto-listen after AI speaks in voice conversation mode */
  autoListenEnabled: boolean;
  /** Temporary chat mode: conversations won't be saved */
  isTemporaryChat: boolean;
  /** User personalization preferences */
  personalization: Personalization;
  /** AI capability toggles */
  capabilities: Capabilities;

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
  setSpeechPitch: (pitch: number) => void;
  setSelectedPresetId: (id: string | null) => void;
  setTtsProvider: (provider: TTSProvider) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
  setCapability: (key: keyof Capabilities, value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
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
      speechPitch: 1.0,
      selectedPresetId: null,
      ttsProvider: 'system',
      autoListenEnabled: true,
      isTemporaryChat: false,
      personalization: {
        fullName: '',
        nickname: '',
        occupation: '',
        instructions: '',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
      capabilities: {
        webSearch: true,
        imageGen: true,
        memory: true,
        desktopControl: true,
      },

      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setBackgroundFetchEnabled: (enabled) => set({ backgroundFetchEnabled: enabled }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setFontPreference: (pref) => set({ fontPreference: pref }),
      setBiometricLockEnabled: (enabled) => set({ biometricLockEnabled: enabled }),
      setSelectedVoiceId: (voiceId) => set({ selectedVoiceId: voiceId }),
      setSpeechRate: (rate) => set({ speechRate: Math.min(Math.max(rate, 0.5), 2.0) }),
      setSpeechPitch: (pitch) => set({ speechPitch: Math.min(Math.max(pitch, 0.5), 2.0) }),
      setSelectedPresetId: (id) => set({ selectedPresetId: id }),
      setTtsProvider: (provider) => set({ ttsProvider: provider }),
      setAutoListenEnabled: (enabled) => set({ autoListenEnabled: enabled }),
      setTemporaryChat: (enabled) => set({ isTemporaryChat: enabled }),
      setPersonalization: (partial) =>
        set({ personalization: { ...get().personalization, ...partial } }),
      setCapability: (key, value) => set({ capabilities: { ...get().capabilities, [key]: value } }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[settingsStore] Hydration failed:', error);
      },
    },
  ),
);
