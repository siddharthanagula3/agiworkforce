/**
 * Local-mode settings store — MMKV key 'settings-store-local'.
 *
 * Holds the cloud-safe preference fields for LOCAL mode. Never synced to the
 * cloud. A change here is completely independent from the cloud-mode store
 * (`cloudSettingsStore`).
 *
 * MIGRATION: On first run (when the MMKV key doesn't exist yet), this store
 * seeds its fields from the legacy 'settings-store' so existing users keep
 * their preferences. Cloud store starts from defaults (server pull populates it
 * from prior sync sessions).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, storage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type {
  ThemeMode,
  AccentColor,
  FontPreference,
  Personalization,
} from '@/stores/settingsStore';

export type { ThemeMode, AccentColor, FontPreference, Personalization };

// ── State shape ──────────────────────────────────────────────────────────────

export interface LocalSettingsState {
  /** Theme mode: dark, light, or follow system */
  themeMode: ThemeMode;
  /** Accent color used by selected controls and highlights */
  accentColor: AccentColor;
  /** Font preference */
  fontPreference: FontPreference;
  /** Enable push notifications (local-mode preference) */
  notificationsEnabled: boolean;
  /** Language prefix for voice filtering (e.g. 'en', 'fr') */
  speechLanguage: string;
  /** Auto-listen after AI speaks in voice conversation mode */
  autoListenEnabled: boolean;
  /** User personalization preferences (local profile, never sent to cloud) */
  personalization: Personalization;

  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontPreference: (pref: FontPreference) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSpeechLanguage: (language: string) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

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

// ── Store ────────────────────────────────────────────────────────────────────

export const useLocalSettingsStore = create<LocalSettingsState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      notificationsEnabled: true,
      speechLanguage: 'en',
      autoListenEnabled: true,
      personalization: defaultPersonalization,

      setThemeMode: (mode) => set({ themeMode: mode }),
      setAccentColor: (color) => set({ accentColor: color }),
      setFontPreference: (pref) => set({ fontPreference: pref }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setSpeechLanguage: (language) => set({ speechLanguage: language }),
      setAutoListenEnabled: (enabled) => set({ autoListenEnabled: enabled }),
      setPersonalization: (partial) =>
        set({ personalization: { ...get().personalization, ...partial } }),
    }),
    {
      name: 'settings-store-local',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      // Deep-merge personalization so a persisted object from before a new field
      // (e.g. `style`) existed still gets the default for that field instead of
      // `undefined`, without needing a version-bump migration for every addition.
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
        // state is undefined when the MMKV key doesn't exist (first run of the
        // split store). Seed from the legacy 'settings-store' so existing users
        // keep their local preferences.
        if (state === undefined) {
          try {
            // Use storage.getString (typed as string | undefined, synchronous) rather
            // than mmkvStorage.getItem (StateStorage interface types it as
            // string | Promise<string | null>).
            const legacyRaw = storage.getString('settings-store');
            if (legacyRaw) {
              const parsed = JSON.parse(legacyRaw) as { state?: Partial<LocalSettingsState> };
              const s = parsed?.state ?? {};
              useLocalSettingsStore.setState({
                themeMode: s.themeMode ?? 'system',
                accentColor: s.accentColor ?? 'neutral',
                fontPreference: s.fontPreference ?? 'default',
                notificationsEnabled: s.notificationsEnabled ?? true,
                speechLanguage: s.speechLanguage ?? 'en',
                autoListenEnabled: s.autoListenEnabled ?? true,
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
