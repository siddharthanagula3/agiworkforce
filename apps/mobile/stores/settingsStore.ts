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
/**
 * Text-to-speech provider. PAR-M20 removed the Cloud TTS provider and its
 * runtime branch, so `'system'` (on-device speech synthesis) is the only live
 * value. A persisted `'cloud'` from an older install is a dead value and is
 * migrated to {@link TTS_DEFAULT_PROVIDER} on load — see
 * {@link migratePersistedSettings} (MOBILE-TTS-CLOUD-DEADSTATE-01).
 */
export type TTSProvider = 'system';

/** Default (and currently only) live TTS provider. */
export const TTS_DEFAULT_PROVIDER: TTSProvider = 'system';

/** Base response style/tone preset; see PERSONALIZATION_STYLES for labels. */
export type PersonalizationStyle = 'default' | 'concise' | 'explanatory' | 'formal';

export interface Personalization {
  fullName: string;
  nickname: string;
  occupation: string;
  instructions: string;
  style: PersonalizationStyle;
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
  /**
   * Apply the stricter client-side content filter for an adult profile.
   * Minor-safe mode is enforced separately by the age gate and cannot be
   * disabled through this preference.
   */
  reduceSensitiveContent: boolean;
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
  /** Voice conversation push-to-talk: mic is live only while the orb is held */
  voicePushToTalk: boolean;
  /**
   * Whether the voice intro + recording disclosure has been acknowledged.
   * Persisted, so it is shown once rather than on every session. Defaults to
   * false for existing installs too: nobody has seen the disclosure yet, and
   * silently treating them as having consented would defeat the point.
   */
  voiceOnboardingSeen: boolean;
  /** Temporary chat mode: local memory learning is disabled for new turns */
  isTemporaryChat: boolean;
  /** AI capability toggles */
  capabilities: Capabilities;

  setAutoApproveMode: (mode: AutoApproveMode) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBackgroundFetchEnabled: (enabled: boolean) => void;
  setReduceSensitiveContent: (enabled: boolean) => void;
  setSelectedVoiceId: (voiceId: string | null) => void;
  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSelectedPresetId: (id: string | null) => void;
  setTtsProvider: (provider: TTSProvider) => void;
  setVoicePushToTalk: (enabled: boolean) => void;
  setVoiceOnboardingSeen: (seen: boolean) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setCapability: (key: keyof Capabilities, value: boolean) => void;
}

/**
 * Persist migration. Coerces any dead persisted `ttsProvider` value (notably
 * the removed `'cloud'` provider — PAR-M20 / MOBILE-TTS-CLOUD-DEADSTATE-01) to
 * {@link TTS_DEFAULT_PROVIDER}. Pure and exported so it can be unit-tested
 * without driving the full zustand persist lifecycle.
 */
export function migratePersistedSettings(
  persisted: unknown,
  _version: number,
): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, unknown>;
  if (state.ttsProvider !== TTS_DEFAULT_PROVIDER) {
    return { ...state, ttsProvider: TTS_DEFAULT_PROVIDER };
  }
  return state;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      autoApproveMode: 'ask',
      hapticsEnabled: true,
      voiceEnabled: true,
      backgroundFetchEnabled: true,
      reduceSensitiveContent: false,
      selectedVoiceId: null,
      speechRate: 1.0,
      speechPitch: 1.0,
      selectedPresetId: null,
      ttsProvider: 'system',
      voicePushToTalk: false,
      voiceOnboardingSeen: false,
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
      setReduceSensitiveContent: (enabled) => set({ reduceSensitiveContent: enabled }),
      setSelectedVoiceId: (voiceId) => set({ selectedVoiceId: voiceId }),
      setSpeechRate: (rate) => set({ speechRate: Math.min(Math.max(rate, 0.5), 2.0) }),
      setSpeechPitch: (pitch) => set({ speechPitch: Math.min(Math.max(pitch, 0.5), 2.0) }),
      setSelectedPresetId: (id) => set({ selectedPresetId: id }),
      setTtsProvider: (provider) => set({ ttsProvider: provider }),
      setVoicePushToTalk: (enabled) => set({ voicePushToTalk: enabled }),
      setVoiceOnboardingSeen: (seen) => set({ voiceOnboardingSeen: seen }),
      setTemporaryChat: (enabled) => set({ isTemporaryChat: enabled }),
      setCapability: (key, value) => set({ capabilities: { ...get().capabilities, [key]: value } }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
      // Bumped to 1 to run migratePersistedSettings (drops the dead 'cloud' TTS
      // provider). Untagged legacy state is treated as version 0.
      version: 1,
      migrate: migratePersistedSettings,
      // AUDIT-FIX: MMKV-RACE — defer rehydration until encrypted MMKV is open.
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[settingsStore] Hydration failed:', error);
        // Belt-and-suspenders: sanitize any dead TTS value that slipped past
        // migrate (e.g. state written by a same-version build before the union
        // narrowed). See MOBILE-TTS-CLOUD-DEADSTATE-01.
        else if (state && state.ttsProvider !== TTS_DEFAULT_PROVIDER) {
          state.ttsProvider = TTS_DEFAULT_PROVIDER;
        }
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsStore, 'settings-store');
