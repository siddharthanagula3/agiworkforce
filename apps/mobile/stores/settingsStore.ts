import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { AutoApproveMode } from '@/types/chat';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'neutral' | 'green' | 'blue' | 'violet' | 'rose' | 'amber';
export type FontPreference = 'default' | 'system' | 'dyslexic';
export type TTSProvider = 'system' | 'cloud';

export interface Personalization {
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
  artifacts: boolean;
  codeExecution: boolean;
  voice: boolean;
  camera: boolean;
}

export interface SettingsState {
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
  /** Accent color used by selected controls and highlights */
  accentColor: AccentColor;
  /** Font preference */
  fontPreference: FontPreference;
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
  /** Language prefix for voice filtering (e.g. 'en', 'fr') */
  speechLanguage: string;
  /** Auto-listen after AI speaks in voice conversation mode */
  autoListenEnabled: boolean;
  /** Temporary chat mode: local memory learning is disabled for new turns */
  isTemporaryChat: boolean;
  /** User personalization preferences */
  personalization: Personalization;
  /** AI capability toggles */
  capabilities: Capabilities;
  /**
   * ISO timestamp of the last cloud-safe settings edit on this device. Null until
   * the user explicitly changes a setting that belongs to the cloud-safe allowlist.
   *
   * Used by the cloud settings sync engine as the LWW `updatedAt` in push payloads.
   * A null value means "factory defaults — never edited on this device", and the sync
   * engine skips the POST so a fresh device pull adopts the existing cloud state rather
   * than clobbering it with local defaults.
   *
   * Stamped by every cloud-safe setter (themeMode, accentColor, fontPreference,
   * personalization, notificationsEnabled, speechLanguage, autoListenEnabled).
   * Device-only setters (hapticsEnabled, voiceEnabled, etc.) do NOT stamp it.
   *
   * NEVER included in the push payload — internal metadata only. The cloud-settings
   * mapping layer (cloudSettingsMapping.ts) explicitly excludes it.
   */
  settingsUpdatedAt: string | null;

  setAutoApproveMode: (mode: AutoApproveMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBackgroundFetchEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontPreference: (pref: FontPreference) => void;
  // LOW-MOB-1 fix (red-team 2026-05): biometricLockEnabled / setBiometricLockEnabled
  // moved out of this MMKV-backed store and into lib/biometricFlagStore.ts
  // (SecureStore-backed). Use `useBiometricFlag(s => s.enabled)` and
  // `useBiometricFlag(s => s.setEnabled)` instead.
  setSelectedVoiceId: (voiceId: string | null) => void;
  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSelectedPresetId: (id: string | null) => void;
  setTtsProvider: (provider: TTSProvider) => void;
  setSpeechLanguage: (language: string) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
  setCapability: (key: keyof Capabilities, value: boolean) => void;
  /**
   * Internal: called by applyCloudSettings after a pull to update settingsUpdatedAt
   * to the server's version timestamp without treating the pull as a local edit.
   * Do not call this from UI code.
   */
  _setSettingsUpdatedAt: (iso: string | null) => void;
}

/** Stamp now for cloud-safe setter changes. */
function nowIso(): string {
  return new Date().toISOString();
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      autoApproveMode: 'ask',
      hapticsEnabled: true,
      notificationsEnabled: true,
      voiceEnabled: true,
      backgroundFetchEnabled: true,
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      selectedVoiceId: null,
      speechRate: 1.0,
      speechPitch: 1.0,
      selectedPresetId: null,
      ttsProvider: 'system',
      speechLanguage: 'en',
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
        artifacts: true,
        codeExecution: true,
        voice: true,
        camera: true,
      },
      // null = never locally edited; sync engine must NOT push defaults to cloud.
      settingsUpdatedAt: null,

      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
      // Device-only setters — do NOT stamp settingsUpdatedAt.
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setBackgroundFetchEnabled: (enabled) => set({ backgroundFetchEnabled: enabled }),
      setSelectedVoiceId: (voiceId) => set({ selectedVoiceId: voiceId }),
      setSpeechRate: (rate) => set({ speechRate: Math.min(Math.max(rate, 0.5), 2.0) }),
      setSpeechPitch: (pitch) => set({ speechPitch: Math.min(Math.max(pitch, 0.5), 2.0) }),
      setSelectedPresetId: (id) => set({ selectedPresetId: id }),
      setTtsProvider: (provider) => set({ ttsProvider: provider }),
      setTemporaryChat: (enabled) => set({ isTemporaryChat: enabled }),
      setCapability: (key, value) => set({ capabilities: { ...get().capabilities, [key]: value } }),

      // Cloud-safe setters — stamp settingsUpdatedAt so the sync engine knows a
      // real local edit happened and can use this timestamp as the LWW key.
      setThemeMode: (mode) => set({ themeMode: mode, settingsUpdatedAt: nowIso() }),
      setAccentColor: (color) => set({ accentColor: color, settingsUpdatedAt: nowIso() }),
      setFontPreference: (pref) => set({ fontPreference: pref, settingsUpdatedAt: nowIso() }),
      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled, settingsUpdatedAt: nowIso() }),
      setSpeechLanguage: (language) =>
        set({ speechLanguage: language, settingsUpdatedAt: nowIso() }),
      setAutoListenEnabled: (enabled) =>
        set({ autoListenEnabled: enabled, settingsUpdatedAt: nowIso() }),
      setPersonalization: (partial) =>
        set({
          personalization: { ...get().personalization, ...partial },
          settingsUpdatedAt: nowIso(),
        }),

      _setSettingsUpdatedAt: (iso) => set({ settingsUpdatedAt: iso }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE — defer rehydration until encrypted MMKV is open.
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[settingsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsStore, 'settings-store');
