import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, storage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type {
  ThemeMode,
  AccentColor,
  FontPreference,
  Personalization,
} from '@/stores/settingsStore';

export interface CloudSettingsState {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  fontPreference: FontPreference;
  notificationsEnabled: boolean;
  speechLanguage: string;
  autoListenEnabled: boolean;
  memoryEnabled: boolean;
  referencePastChats: boolean;
  generateMemoryFromHistory: boolean;
  memoryPolicyInitialized: boolean;
  personalization: Personalization;
  settingsUpdatedAt: string | null;

  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontPreference: (pref: FontPreference) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSpeechLanguage: (language: string) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setMemoryEnabled: (enabled: boolean) => void;
  setReferencePastChats: (enabled: boolean) => void;
  setGenerateMemoryFromHistory: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
  _setSettingsUpdatedAt: (iso: string | null) => void;
}

function nowIso(): string {
  return new Date().toISOString();
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
};

export const useCloudSettingsStore = create<CloudSettingsState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      notificationsEnabled: true,
      speechLanguage: 'en',
      autoListenEnabled: true,
      memoryEnabled: true,
      referencePastChats: false,
      generateMemoryFromHistory: true,
      memoryPolicyInitialized: false,
      personalization: defaultPersonalization,
      settingsUpdatedAt: null,

      setThemeMode: (mode) => set({ themeMode: mode, settingsUpdatedAt: nowIso() }),
      setAccentColor: (color) => set({ accentColor: color, settingsUpdatedAt: nowIso() }),
      setFontPreference: (pref) => set({ fontPreference: pref, settingsUpdatedAt: nowIso() }),
      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled, settingsUpdatedAt: nowIso() }),
      setSpeechLanguage: (language) =>
        set({ speechLanguage: language, settingsUpdatedAt: nowIso() }),
      setAutoListenEnabled: (enabled) =>
        set({ autoListenEnabled: enabled, settingsUpdatedAt: nowIso() }),
      setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
      setReferencePastChats: (enabled) =>
        set({
          referencePastChats: enabled,
          memoryPolicyInitialized: true,
          settingsUpdatedAt: nowIso(),
        }),
      setGenerateMemoryFromHistory: (enabled) =>
        set({
          generateMemoryFromHistory: enabled,
          memoryPolicyInitialized: true,
          settingsUpdatedAt: nowIso(),
        }),
      setPersonalization: (partial) =>
        set({
          personalization: { ...get().personalization, ...partial },
          settingsUpdatedAt: nowIso(),
        }),

      _setSettingsUpdatedAt: (iso) => set({ settingsUpdatedAt: iso }),
    }),
    {
      name: 'settings-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<CloudSettingsState>;
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
          console.warn('[cloudSettingsStore] Hydration failed:', error);
          return;
        }
        if (state === undefined) {
          try {
            const legacyRaw = storage.getString('settings-store');
            if (legacyRaw) {
              const parsed = JSON.parse(legacyRaw) as { state?: Partial<CloudSettingsState> };
              const s = parsed?.state ?? {};
              useCloudSettingsStore.setState({
                themeMode: s.themeMode ?? 'system',
                accentColor: s.accentColor ?? 'neutral',
                fontPreference: s.fontPreference ?? 'default',
                notificationsEnabled: s.notificationsEnabled ?? true,
                speechLanguage: s.speechLanguage ?? 'en',
                autoListenEnabled: s.autoListenEnabled ?? true,
                memoryEnabled: s.memoryEnabled ?? true,
                referencePastChats: s.referencePastChats ?? false,
                generateMemoryFromHistory: s.generateMemoryFromHistory ?? true,
                memoryPolicyInitialized: s.memoryPolicyInitialized ?? false,
                personalization: s.personalization ?? defaultPersonalization,
              });
            }
          } catch (e) {
            console.warn('[cloudSettingsStore] Migration from legacy store failed:', e);
          }
        }
      },
    },
  ),
);

rehydrateWhenMmkvReady(useCloudSettingsStore, 'settings-store-cloud');
