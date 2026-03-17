/**
 * Settings V2 Store
 *
 * Zustand store providing a typed API over the settings_v2 Tauri commands.
 * These operate on the Rust SettingsService (SQLite-backed key-value store
 * with categories and optional encryption).
 *
 * Wires all 9 commands from settings_v2.rs:
 * - settings_v2_get, settings_v2_set, settings_v2_get_batch
 * - settings_v2_delete, settings_v2_get_category
 * - settings_v2_load_app_settings, settings_v2_save_app_settings
 * - settings_v2_clear_cache, settings_v2_list_all
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// ---- Types matching Rust backend structs (serde_json::Value -> unknown) ----

export interface SettingsResponse {
  success: boolean;
  message?: string;
}

export interface GetSettingsResponse {
  settings: Record<string, unknown>;
}

export type SettingCategory =
  | 'general'
  | 'appearance'
  | 'llm'
  | 'privacy'
  | 'security'
  | 'advanced'
  | 'extensions'
  | 'notifications'
  | 'research'
  | 'automation';

interface SettingsV2State {
  /** Cached individual settings */
  cache: Record<string, unknown>;
  /** App-level settings (loaded as a structured object) */
  appSettings: Record<string, unknown> | null;
  /** Loading flag */
  loading: boolean;
  /** Error state */
  error: string | null;
}

interface SettingsV2Actions {
  // Single key operations
  getSetting: (key: string) => Promise<unknown>;
  setSetting: (
    key: string,
    value: unknown,
    category: SettingCategory,
    encrypted?: boolean,
  ) => Promise<boolean>;
  deleteSetting: (key: string) => Promise<boolean>;

  // Batch operations
  getBatch: (keys: string[]) => Promise<Record<string, unknown>>;
  getCategory: (category: SettingCategory) => Promise<Record<string, unknown>>;
  listAll: () => Promise<Record<string, unknown>>;

  // App settings (structured)
  loadAppSettings: () => Promise<Record<string, unknown> | null>;
  saveAppSettings: (settings: Record<string, unknown>) => Promise<boolean>;

  // Cache management
  clearBackendCache: () => Promise<boolean>;

  // Utility
  clearError: () => void;
}

// ---- Store ----

export const useSettingsV2Store = create<SettingsV2State & SettingsV2Actions>()(
  devtools(
    immer((set) => ({
      cache: {},
      appSettings: null,
      loading: false,
      error: null,

      getSetting: async (key) => {
        try {
          const value = await invoke<unknown>('settings_v2_get', { key });
          set(
            (state) => {
              state.cache[key] = value;
            },
            undefined,
            'settingsV2/get',
          );
          return value;
        } catch (error) {
          console.error(`Failed to get setting "${key}":`, error);
          set({ error: String(error) }, undefined, 'settingsV2/get/error');
          return undefined;
        }
      },

      setSetting: async (key, value, category, encrypted = false) => {
        try {
          await invoke<SettingsResponse>('settings_v2_set', {
            request: { key, value, category, encrypted },
          });
          set(
            (state) => {
              state.cache[key] = value;
            },
            undefined,
            'settingsV2/set',
          );
          return true;
        } catch (error) {
          console.error(`Failed to set setting "${key}":`, error);
          set({ error: String(error) }, undefined, 'settingsV2/set/error');
          return false;
        }
      },

      deleteSetting: async (key) => {
        try {
          await invoke<SettingsResponse>('settings_v2_delete', { key });
          set(
            (state) => {
              delete state.cache[key];
            },
            undefined,
            'settingsV2/delete',
          );
          return true;
        } catch (error) {
          console.error(`Failed to delete setting "${key}":`, error);
          set({ error: String(error) }, undefined, 'settingsV2/delete/error');
          return false;
        }
      },

      getBatch: async (keys) => {
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_get_batch', {
            request: { keys },
          });
          const settings = response.settings;
          set(
            (state) => {
              for (const [k, v] of Object.entries(settings)) {
                state.cache[k] = v;
              }
            },
            undefined,
            'settingsV2/getBatch',
          );
          return settings;
        } catch (error) {
          console.error('Failed to get batch settings:', error);
          set({ error: String(error) }, undefined, 'settingsV2/getBatch/error');
          return {};
        }
      },

      getCategory: async (category) => {
        set({ loading: true, error: null }, undefined, 'settingsV2/getCategory/start');
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_get_category', {
            category,
          });
          const settings = response.settings;
          set(
            (state) => {
              for (const [k, v] of Object.entries(settings)) {
                state.cache[k] = v;
              }
              state.loading = false;
            },
            undefined,
            'settingsV2/getCategory/success',
          );
          return settings;
        } catch (error) {
          console.error(`Failed to get category "${category}":`, error);
          set({ error: String(error), loading: false }, undefined, 'settingsV2/getCategory/error');
          return {};
        }
      },

      listAll: async () => {
        set({ loading: true, error: null }, undefined, 'settingsV2/listAll/start');
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_list_all');
          const settings = response.settings;
          set(
            (state) => {
              state.cache = { ...state.cache, ...settings };
              state.loading = false;
            },
            undefined,
            'settingsV2/listAll/success',
          );
          return settings;
        } catch (error) {
          console.error('Failed to list all settings:', error);
          set({ error: String(error), loading: false }, undefined, 'settingsV2/listAll/error');
          return {};
        }
      },

      loadAppSettings: async () => {
        set({ loading: true, error: null }, undefined, 'settingsV2/loadApp/start');
        try {
          const settings = await invoke<Record<string, unknown>>('settings_v2_load_app_settings');
          set({ appSettings: settings, loading: false }, undefined, 'settingsV2/loadApp/success');
          return settings;
        } catch (error) {
          console.error('Failed to load app settings:', error);
          set({ error: String(error), loading: false }, undefined, 'settingsV2/loadApp/error');
          return null;
        }
      },

      saveAppSettings: async (settings) => {
        try {
          await invoke<SettingsResponse>('settings_v2_save_app_settings', { settings });
          set({ appSettings: settings }, undefined, 'settingsV2/saveApp/success');
          return true;
        } catch (error) {
          console.error('Failed to save app settings:', error);
          set({ error: String(error) }, undefined, 'settingsV2/saveApp/error');
          return false;
        }
      },

      clearBackendCache: async () => {
        try {
          await invoke<SettingsResponse>('settings_v2_clear_cache');
          return true;
        } catch (error) {
          console.error('Failed to clear backend settings cache:', error);
          set({ error: String(error) }, undefined, 'settingsV2/clearCache/error');
          return false;
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'settingsV2/clearError');
      },
    })),
    { name: 'SettingsV2Store', enabled: import.meta.env.DEV },
  ),
);

// ---- Selectors ----

export const selectSettingsCache = (state: SettingsV2State) => state.cache;
export const selectAppSettings = (state: SettingsV2State) => state.appSettings;
export const selectSettingsLoading = (state: SettingsV2State) => state.loading;
export const selectSettingsError = (state: SettingsV2State) => state.error;
