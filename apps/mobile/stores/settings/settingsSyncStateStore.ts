/**
 * Settings cloud sync sidecar state.
 *
 * Tracks the settings delta-sync cursor (a separate bigint-as-string high-water
 * mark, independent from chat/memory/project cursors) and the last-pushed
 * snapshot of the cloud-safe settings projection (used for dirty detection by
 * comparing the current projection against the baseline rather than hooking into
 * every setter — avoids polluting the shared settings store with cloud concerns).
 *
 * A separate store (rather than extending any existing sync-state store) keeps
 * the blast radius minimal: settings cursor is an independent sequence from all
 * other cursors.
 *
 * NEVER stores secrets. The snapshot holds only cloud-safe namespaces
 * (as produced by toCloudSettings() in cloudSettingsMapping.ts).
 *
 * NEVER tracks local-only settings that must not cross the trust boundary.
 * The mapping layer (cloudSettingsMapping.ts) is the SSOT for what is safe.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface SettingsSyncState {
  /**
   * Highest `server_version` applied from a settings pull (bigint as a string).
   * '0' means never synced.
   */
  settingsCursor: string;

  /**
   * Serialized JSON snapshot of the last successfully pushed cloud-safe settings
   * projection (as returned by toCloudSettings()). Empty string means never pushed.
   * Used to detect whether a push is needed: if the current projection serializes
   * the same as this baseline, skip the POST.
   */
  lastPushedSnapshot: string;

  setSettingsCursor: (cursor: string) => void;
  setLastPushedSnapshot: (snapshot: string) => void;
  /** Reset all settings sync bookkeeping (e.g. on sign-out / account switch). */
  resetSettingsSync: () => void;
}

export const useSettingsSyncStateStore = create<SettingsSyncState>()(
  persist(
    (set) => ({
      settingsCursor: '0',
      lastPushedSnapshot: '',

      setSettingsCursor: (cursor) => set({ settingsCursor: cursor }),
      setLastPushedSnapshot: (snapshot) => set({ lastPushedSnapshot: snapshot }),

      resetSettingsSync: () =>
        set({
          settingsCursor: '0',
          lastPushedSnapshot: '',
        }),
    }),
    {
      name: 'settings-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        settingsCursor: s.settingsCursor,
        lastPushedSnapshot: s.lastPushedSnapshot,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[settingsSyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsSyncStateStore, 'settings-sync-state');
