import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plugin } from '../types';

const PLUGIN_INSTALLS_ENABLED = false;

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
        if (!PLUGIN_INSTALLS_ENABLED) return;
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
        if (!PLUGIN_INSTALLS_ENABLED) return;
        set((state) => {
          const next = { ...state.installed };
          delete next[id];
          return { installed: next };
        });
      },

      getInstalledPlugins: () => {
        if (!PLUGIN_INSTALLS_ENABLED) return [];
        return Object.values(get().installed);
      },

      isInstalled: (id: string) => {
        if (!PLUGIN_INSTALLS_ENABLED) return false;
        return id in get().installed;
      },
    }),
    {
      name: 'agi-plugins',
      version: 1,
    },
  ),
);
