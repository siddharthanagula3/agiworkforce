import { create } from 'zustand';
import { RESPONSE_LANGUAGE_AUTO } from '@agiworkforce/types';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, storage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  SPEECH_LANGUAGE_AUTO,
  speechLanguageFromLegacy,
} from '@/src/features/voice/speechLanguage';
import type {
  ThemeMode,
  AccentColor,
  FontPreference,
  Personalization,
} from '@/stores/settingsStore';

export type { ThemeMode, AccentColor, FontPreference, Personalization };

export interface LocalSettingsState {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  fontPreference: FontPreference;
  notificationsEnabled: boolean;
  speechLanguage: string;
  autoListenEnabled: boolean;
  startWithVoice: boolean;
  memoryEnabled: boolean;
  referencePastChats: boolean;
  generateMemoryFromHistory: boolean;
  includeSensitiveTopics: boolean;
  autoCorrectEnabled: boolean;
  personalization: Personalization;

  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontPreference: (pref: FontPreference) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSpeechLanguage: (language: string) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setStartWithVoice: (enabled: boolean) => void;
  setMemoryEnabled: (enabled: boolean) => void;
  setReferencePastChats: (enabled: boolean) => void;
  setGenerateMemoryFromHistory: (enabled: boolean) => void;
  setIncludeSensitiveTopics: (enabled: boolean) => void;
  setAutoCorrectEnabled: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
}

const defaultPersonalization: Personalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
  aboutYou: '',
  preferredLength: 'default',
  technicalLevel: 'unspecified',
  responseLanguage: RESPONSE_LANGUAGE_AUTO,
};

export const useLocalSettingsStore = create<LocalSettingsState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      notificationsEnabled: true,
      speechLanguage: SPEECH_LANGUAGE_AUTO,
      autoListenEnabled: true,
      startWithVoice: false,
      memoryEnabled: true,
      referencePastChats: true,
      generateMemoryFromHistory: true,
      includeSensitiveTopics: false,
      autoCorrectEnabled: true,
      personalization: defaultPersonalization,

      setThemeMode: (mode) => set({ themeMode: mode }),
      setAccentColor: (color) => set({ accentColor: color }),
      setFontPreference: (pref) => set({ fontPreference: pref }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setSpeechLanguage: (language) => set({ speechLanguage: language }),
      setAutoListenEnabled: (enabled) => set({ autoListenEnabled: enabled }),
      setStartWithVoice: (enabled) => set({ startWithVoice: enabled }),
      setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
      setReferencePastChats: (enabled) => set({ referencePastChats: enabled }),
      setGenerateMemoryFromHistory: (enabled) => set({ generateMemoryFromHistory: enabled }),
      setIncludeSensitiveTopics: (enabled) => set({ includeSensitiveTopics: enabled }),
      setAutoCorrectEnabled: (enabled) => set({ autoCorrectEnabled: enabled }),
      setPersonalization: (partial) =>
        set({ personalization: { ...get().personalization, ...partial } }),
    }),
    {
      name: 'settings-store-local',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<LocalSettingsState>;
        return version < 1
          ? { ...state, speechLanguage: speechLanguageFromLegacy(state.speechLanguage) }
          : state;
      },
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<LocalSettingsState>;
        return {
          ...current,
          ...persistedState,
          personalization: {
            ...current.personalization,
            ...(persistedState.personalization ?? {}),
          },
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[localSettingsStore] Hydration failed:', error);
          return;
        }
        if (state === undefined) {
          try {
            const legacyRaw = storage.getString('settings-store');
            if (legacyRaw) {
              const parsed = JSON.parse(legacyRaw) as { state?: Partial<LocalSettingsState> };
              const s = parsed?.state ?? {};
              useLocalSettingsStore.setState({
                themeMode: s.themeMode ?? 'system',
                accentColor: s.accentColor ?? 'neutral',
                fontPreference: s.fontPreference ?? 'default',
                notificationsEnabled: s.notificationsEnabled ?? true,
                speechLanguage: speechLanguageFromLegacy(s.speechLanguage),
                autoListenEnabled: s.autoListenEnabled ?? true,
                memoryEnabled: s.memoryEnabled ?? true,
                referencePastChats: s.referencePastChats ?? true,
                generateMemoryFromHistory: s.generateMemoryFromHistory ?? true,
                personalization: s.personalization ?? defaultPersonalization,
              });
            }
          } catch (e) {
            console.warn('[localSettingsStore] Migration from legacy store failed:', e);
          }
        }
      },
    },
  ),
);

rehydrateWhenMmkvReady(useLocalSettingsStore, 'settings-store-local');

let launchVoiceTaken = false;

export function takeStartWithVoiceOnLaunch(): boolean {
  if (launchVoiceTaken) return false;
  launchVoiceTaken = true;
  return useLocalSettingsStore.getState().startWithVoice;
}

export function __resetStartWithVoiceLaunchForTests(): void {
  launchVoiceTaken = false;
}
