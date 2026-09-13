import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  isToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

// ── Types re-exported for consumers and mode-specific stores ─────────────────

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'neutral' | 'green' | 'blue' | 'violet' | 'rose' | 'amber';
export type FontPreference = 'default' | 'system' | 'dyslexic';
/**
 * Text-to-speech provider. PAR-M20 removed the Cloud TTS provider and its
 * runtime branch, so `'system'` (on-device speech synthesis) is the only live
 * value. A persisted `'cloud'` from an older install is a dead value and is
 * migrated to {@link TTS_DEFAULT_PROVIDER} on load, see
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
  toolApprovalPolicy: ToolApprovalPolicy;
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

  setToolApprovalPolicy: (policy: ToolApprovalPolicy) => void;
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
 * The pre-server approval union. `full` had no server policy behind it, so it
 * fails closed onto the default rather than carrying a promise the backend
 * never honoured.
 */
const MIGRATED_APPROVAL_MODES: Record<string, ToolApprovalPolicy> = {
  ask: 'ask_every_time',
  smart: 'auto_approve_read_only',
  full: DEFAULT_TOOL_APPROVAL_POLICY,
};

/**
 * Persist migration. Coerces any dead persisted `ttsProvider` value (notably
 * the removed `'cloud'` provider, PAR-M20 / MOBILE-TTS-CLOUD-DEADSTATE-01) to
 * {@link TTS_DEFAULT_PROVIDER}. Pure and exported so it can be unit-tested
 * without driving the full zustand persist lifecycle.
 */
export function migratePersistedSettings(
  persisted: unknown,
  _version: number,
): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, unknown>;
  const next = { ...state };
  if (next.ttsProvider !== TTS_DEFAULT_PROVIDER) next.ttsProvider = TTS_DEFAULT_PROVIDER;
  const storedPolicy =
    next.toolApprovalPolicy ?? MIGRATED_APPROVAL_MODES[String(next.autoApproveMode)];
  next.toolApprovalPolicy = isToolApprovalPolicy(storedPolicy)
    ? storedPolicy
    : DEFAULT_TOOL_APPROVAL_POLICY;
  delete next.autoApproveMode;
  return next;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
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

      setToolApprovalPolicy: (policy) => set({ toolApprovalPolicy: policy }),
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
      version: 2,
      migrate: migratePersistedSettings,
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[settingsStore] Hydration failed:', error);
        // Belt-and-suspenders: sanitize any dead TTS value that slipped past
        // migrate (e.g. state written by a same-version build before the union
        // narrowed). See MOBILE-TTS-CLOUD-DEADSTATE-01.
        else if (state) {
          if (state.ttsProvider !== TTS_DEFAULT_PROVIDER) state.ttsProvider = TTS_DEFAULT_PROVIDER;
          if (!isToolApprovalPolicy(state.toolApprovalPolicy)) {
            state.toolApprovalPolicy = DEFAULT_TOOL_APPROVAL_POLICY;
          }
        }
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsStore, 'settings-store');
