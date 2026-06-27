import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { AutoApproveMode } from '@/types/chat';

// ── Types re-exported for consumers and mode-specific stores ─────────────────
// These type definitions are the canonical source; localSettingsStore and
// cloudSettingsStore import from here.

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

// ── Device-global settings state ─────────────────────────────────────────────
// These fields are the SAME regardless of whether the user is in Local or
// Cloud mode. Mode-separated fields (appearance, personalization, language,
// notifications, auto-listen) live in localSettingsStore / cloudSettingsStore.
//
// LOW-MOB-1 fix (red-team 2026-05): biometricLockEnabled / setBiometricLockEnabled
// moved out of this store and into lib/biometricFlagStore.ts (SecureStore-backed).
// Use `useBiometricFlag(s => s.enabled)` and `useBiometricFlag(s => s.setEnabled)`.

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
  /** Enable voice features */
  voiceEnabled: boolean;
  /** Enable background fetch for agent status polling */
  backgroundFetchEnabled: boolean;
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
  /** Temporary chat mode: local memory learning is disabled for new turns */
  isTemporaryChat: boolean;
  /** AI capability toggles */
  capabilities: Capabilities;

  setAutoApproveMode: (mode: AutoApproveMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBackgroundFetchEnabled: (enabled: boolean) => void;
  setSelectedVoiceId: (voiceId: string | null) => void;
  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSelectedPresetId: (id: string | null) => void;
  setTtsProvider: (provider: TTSProvider) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setCapability: (key: keyof Capabilities, value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      autoApproveMode: 'ask',
      hapticsEnabled: true,
      voiceEnabled: true,
      backgroundFetchEnabled: true,
      selectedVoiceId: null,
      speechRate: 1.0,
      speechPitch: 1.0,
      selectedPresetId: null,
      ttsProvider: 'system',
      isTemporaryChat: false,
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

      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
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
