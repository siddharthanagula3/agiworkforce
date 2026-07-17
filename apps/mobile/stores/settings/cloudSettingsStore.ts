/**
 * Cloud-mode settings store — MMKV key 'settings-store-cloud'.
 *
 * Holds the cloud-safe preference fields for CLOUD mode. Synced to the server
 * via the existing cloud-settings wiring (cloudSettingsMapping + settingsSyncStateStore
 * + cloudSyncEngine). A change here is completely independent from the local-mode
 * store (`localSettingsStore`).
 *
 * `settingsUpdatedAt` is a local-only dirty marker. It is never sent to the
 * server and never participates in conflict resolution; Cloud pushes use the
 * last observed server revision instead.
 *
 * MIGRATION: On first run (when the MMKV key doesn't exist yet), this store
 * seeds its fields from the legacy 'settings-store' to prevent a flash-of-defaults
 * before the first server pull. settingsUpdatedAt is left null so the seeded state
 * is not treated as a local edit — the next pull adopts the server revision.
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

// ── State shape ──────────────────────────────────────────────────────────────

export interface CloudSettingsState {
  /** Theme mode: dark, light, or follow system */
  themeMode: ThemeMode;
  /** Accent color used by selected controls and highlights */
  accentColor: AccentColor;
  /** Font preference */
  fontPreference: FontPreference;
  /** Enable push notifications (cloud-mode preference) */
  notificationsEnabled: boolean;
  /** Language prefix for voice filtering (e.g. 'en', 'fr') */
  speechLanguage: string;
  /** Auto-listen after AI speaks in voice conversation mode */
  autoListenEnabled: boolean;
  /** User personalization preferences (sent to cloud via cloudSettingsMapping) */
  personalization: Personalization;
  /**
   * ISO timestamp of the last cloud-safe settings edit in cloud mode. Null until
   * the user explicitly changes a setting. Null means "never edited on this
   * device" so the sync engine skips the POST and pulls instead.
   *
   * Internal metadata — NEVER included in the push payload itself.
   */
  settingsUpdatedAt: string | null;

  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontPreference: (pref: FontPreference) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSpeechLanguage: (language: string) => void;
  setAutoListenEnabled: (enabled: boolean) => void;
  setPersonalization: (partial: Partial<Personalization>) => void;
  /**
   * Internal: called by applyCloudSettings after a pull to update settingsUpdatedAt
   * to match server state without treating the pull as a local edit.
   * Do not call this from UI code.
   */
  _setSettingsUpdatedAt: (iso: string | null) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Store ────────────────────────────────────────────────────────────────────

export const useCloudSettingsStore = create<CloudSettingsState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      notificationsEnabled: true,
      speechLanguage: 'en',
      autoListenEnabled: true,
      personalization: defaultPersonalization,
      // null = never locally edited in cloud mode; sync engine skips push and
      // pulls server state on the first cloud sync cycle.
      settingsUpdatedAt: null,

      // Cloud-safe setters stamp the local dirty marker. Its wall-clock value is
      // never used as a server conflict key.
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
      name: 'settings-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      // Deep-merge personalization so a persisted object from before a new field
      // (e.g. `style`) existed still gets the default for that field instead of
      // `undefined`, without needing a version-bump migration for every addition.
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
        // state is undefined when the MMKV key doesn't exist (first run of the
        // split store). Seed from the legacy 'settings-store' to prevent a flash
        // of defaults before the first server pull. settingsUpdatedAt stays null
        // so the sync engine skips the push path and pulls instead.
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
                personalization: s.personalization ?? defaultPersonalization,
                // settingsUpdatedAt left null — seeded state is not a local edit.
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
