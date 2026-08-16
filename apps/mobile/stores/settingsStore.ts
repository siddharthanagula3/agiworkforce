import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { AutoApproveMode } from '@/types/chat';

// ── Types re-exported for consumers and mode-specific stores ─────────────────

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

export const TTS_DEFAULT_PROVIDER: TTSProvider = 'system';

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
  autoApproveMode: AutoApproveMode;
  hapticsEnabled: boolean;
  voiceEnabled: boolean;
  backgroundFetchEnabled: boolean;
  reduceSensitiveContent: boolean;
  selectedVoiceId: string | null;
  speechRate: number;
  speechPitch: number;
  selectedPresetId: string | null;
  ttsProvider: TTSProvider;
  voicePushToTalk: boolean;
  voiceOnboardingSeen: boolean;
  isTemporaryChat: boolean;
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
      version: 1,
      migrate: migratePersistedSettings,
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
