/**
 * Cloud-mode settings store — MMKV key 'settings-store-cloud'.
 *
 * Holds the cloud-safe preference fields for CLOUD mode. Synced to the server
 * via the existing cloud-settings wiring (cloudSettingsMapping + settingsSyncStateStore
 * + cloudSyncEngine). A change here is completely independent from the local-mode
 * store (`localSettingsStore`).
 *
 * `settingsUpdatedAt` is the LWW (last-writer-wins) timestamp used by the sync
 * engine when pushing to POST /api/settings/sync. It is cloud-only by design:
 * local-mode preferences never sync and therefore have no need for an updatedAt.
 *
 * Cloud store starts from defaults on first install. The first successful pull
 * from the server populates it with the user's existing cloud preferences.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
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
   * the user explicitly changes a setting. Used by the sync engine as the LWW
   * `updatedAt` in push payloads. Null means "never edited on this device" →
   * sync engine skips the POST and pulls instead.
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
      name: 'settings-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudSettingsStore] Hydration failed:', error);
        // Cloud store starts from defaults; first server pull populates it.
        // No migration needed — the server has the ground truth.
      },
    },
  ),
);

rehydrateWhenMmkvReady(useCloudSettingsStore, 'settings-store-cloud');
