import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plugin } from '../types';

interface PluginStoreState {
  installed: Record<string, Plugin>;
}

interface PluginStoreActions {
  installPlugin: (plugin: Plugin) => void;
  uninstallPlugin: (id: string) => void;
  getInstalledPlugins: () => Plugin[];
  isInstalled: (id: string) => boolean;
}

export const usePluginStore = create<PluginStoreState & PluginStoreActions>()(
  persist(
    (set, get) => ({
      installed: {},

      installPlugin: (plugin: Plugin) => {
        set((state) => ({
          installed: {
            ...state.installed,
            [plugin.id]: {
              ...plugin,
              installedAt: new Date().toISOString(),
            },
          },
        }));
      },

      uninstallPlugin: (id: string) => {
        set((state) => {
          const next = { ...state.installed };
          delete next[id];
          return { installed: next };
        });
      },

      getInstalledPlugins: () => {
        return Object.values(get().installed);
      },

      isInstalled: (id: string) => {
        return id in get().installed;
      },
    }),
    {
      name: 'agi-plugins',
      version: 1,
    },
  ),
);
