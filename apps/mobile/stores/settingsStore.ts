import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  isToolApprovalPolicy,
  type PreferredLength,
  type TechnicalLevel,
  type ToolApprovalPolicy,
} from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { isAudioRoute, type AudioRoute } from '@/src/features/voice/services/audioRoute';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'neutral' | 'green' | 'blue' | 'violet' | 'rose' | 'amber';
export type FontPreference = 'default' | 'system' | 'dyslexic';
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
  aboutYou?: string;
  preferredLength?: PreferredLength;
  technicalLevel?: TechnicalLevel;
  responseLanguage?: string;
  nameOptedOut?: boolean;
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
  liveVoice: string | null;
  voicePushToTalk: boolean;
  voiceOnboardingSeen: boolean;
  dictationOnboardingSeen: boolean;
  audioRoute: AudioRoute;
  isTemporaryChat: boolean;
  temporaryChatPersonalized: boolean;

  setToolApprovalPolicy: (policy: ToolApprovalPolicy) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBackgroundFetchEnabled: (enabled: boolean) => void;
  setReduceSensitiveContent: (enabled: boolean) => void;
  setSelectedVoiceId: (voiceId: string | null) => void;
  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSelectedPresetId: (id: string | null) => void;
  setLiveVoice: (voice: string | null) => void;
  setVoicePushToTalk: (enabled: boolean) => void;
  setVoiceOnboardingSeen: (seen: boolean) => void;
  setDictationOnboardingSeen: (seen: boolean) => void;
  setAudioRoute: (route: AudioRoute) => void;
  setTemporaryChat: (enabled: boolean) => void;
  setTemporaryChatPersonalized: (personalized: boolean) => void;
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
 * `ttsProvider` and `capabilities` were persisted by older builds and nothing
 * reads them any more, so they are dropped rather than carried forward.
 */
const RETIRED_SETTINGS_KEYS = ['ttsProvider', 'capabilities', 'autoApproveMode'] as const;

export function migratePersistedSettings(
  persisted: unknown,
  _version: number,
): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, unknown>;
  const next = { ...state };
  const storedPolicy =
    next.toolApprovalPolicy ?? MIGRATED_APPROVAL_MODES[String(next.autoApproveMode)];
  next.toolApprovalPolicy = isToolApprovalPolicy(storedPolicy)
    ? storedPolicy
    : DEFAULT_TOOL_APPROVAL_POLICY;
  for (const key of RETIRED_SETTINGS_KEYS) delete next[key];
  return next;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY,
      hapticsEnabled: true,
      voiceEnabled: true,
      backgroundFetchEnabled: true,
      reduceSensitiveContent: false,
      selectedVoiceId: null,
      speechRate: 1.0,
      speechPitch: 1.0,
      selectedPresetId: null,
      liveVoice: null,
      voicePushToTalk: false,
      voiceOnboardingSeen: false,
      dictationOnboardingSeen: false,
      audioRoute: 'auto',
      isTemporaryChat: false,
      temporaryChatPersonalized: true,

      setToolApprovalPolicy: (policy) => set({ toolApprovalPolicy: policy }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setBackgroundFetchEnabled: (enabled) => set({ backgroundFetchEnabled: enabled }),
      setReduceSensitiveContent: (enabled) => set({ reduceSensitiveContent: enabled }),
      setSelectedVoiceId: (voiceId) => set({ selectedVoiceId: voiceId }),
      setSpeechRate: (rate) => set({ speechRate: Math.min(Math.max(rate, 0.5), 2.0) }),
      setSpeechPitch: (pitch) => set({ speechPitch: Math.min(Math.max(pitch, 0.5), 2.0) }),
      setSelectedPresetId: (id) => set({ selectedPresetId: id }),
      setLiveVoice: (voice) => set({ liveVoice: voice }),
      setVoicePushToTalk: (enabled) => set({ voicePushToTalk: enabled }),
      setVoiceOnboardingSeen: (seen) => set({ voiceOnboardingSeen: seen }),
      setDictationOnboardingSeen: (seen) => set({ dictationOnboardingSeen: seen }),
      setAudioRoute: (route) => set({ audioRoute: route }),
      setTemporaryChat: (enabled) => set({ isTemporaryChat: enabled }),
      setTemporaryChatPersonalized: (personalized) =>
        set({ temporaryChatPersonalized: personalized }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => mmkvStorage),
      version: 3,
      migrate: migratePersistedSettings,
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[settingsStore] Hydration failed:', error);
        else if (state) {
          if (!isToolApprovalPolicy(state.toolApprovalPolicy)) {
            state.toolApprovalPolicy = DEFAULT_TOOL_APPROVAL_POLICY;
          }
          if (!isAudioRoute(state.audioRoute)) state.audioRoute = 'auto';
        }
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsStore, 'settings-store');
