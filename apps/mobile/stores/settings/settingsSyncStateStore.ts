import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface SettingsSyncState {
  settingsCursor: string;

  lastPushedSnapshot: string;

  serverSnapshot: string;

  setSettingsCursor: (cursor: string) => void;
  setLastPushedSnapshot: (snapshot: string) => void;
  setServerSnapshot: (snapshot: string) => void;
  resetSettingsSync: () => void;
}

export const useSettingsSyncStateStore = create<SettingsSyncState>()(
  persist(
    (set) => ({
      settingsCursor: '0',
      lastPushedSnapshot: '',
      serverSnapshot: '',

      setSettingsCursor: (cursor) => set({ settingsCursor: cursor }),
      setLastPushedSnapshot: (snapshot) => set({ lastPushedSnapshot: snapshot }),
      setServerSnapshot: (snapshot) => set({ serverSnapshot: snapshot }),

      resetSettingsSync: () =>
        set({
          settingsCursor: '0',
          lastPushedSnapshot: '',
          serverSnapshot: '',
        }),
    }),
    {
      name: 'settings-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        settingsCursor: s.settingsCursor,
        lastPushedSnapshot: s.lastPushedSnapshot,
        serverSnapshot: s.serverSnapshot,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[settingsSyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useSettingsSyncStateStore, 'settings-sync-state');
