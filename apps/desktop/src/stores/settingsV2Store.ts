/**
 * Settings V2 Store
 *
 * Wires the settings_v2_* Tauri commands (SQLite-backed key-value settings)
 * to the frontend. This complements the existing settingsStore which manages
 * localStorage-persisted UI settings. The V2 system is the Rust-side
 * persistent settings layer with categories, encryption support, and app-wide
 * settings bundles.
 *
 * Covered commands (sys/commands/settings_v2.rs):
 *   settings_v2_get              -- get a single setting by key
 *   settings_v2_set              -- upsert a setting (key, value, category, encrypted)
 *   settings_v2_get_batch        -- get multiple settings by key array
 *   settings_v2_delete           -- delete a setting by key
 *   settings_v2_get_category     -- get all settings in a category
 *   settings_v2_load_app_settings -- load the full AppSettings bundle
 *   settings_v2_save_app_settings -- save the full AppSettings bundle
 *   settings_v2_clear_cache      -- clear the in-memory settings cache
 *   settings_v2_list_all         -- list all non-encrypted settings
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs in sys/commands/settings_v2.rs)
// =============================================================================

export interface SettingsResponse {
  success: boolean;
  message: string | null;
}

export interface SetSettingRequest {
  key: string;
  value: unknown;
  category: string;
  encrypted: boolean;
}

export interface GetSettingsResponse {
  settings: Record<string, unknown>;
}

/**
 * AppSettings bundle from the Rust backend.
 * Exact shape depends on data/settings/models.rs — treat as generic record.
 */
export type AppSettings = Record<string, unknown>;

// =============================================================================
// Store State
// =============================================================================

interface SettingsV2StoreState {
  /** Cached settings from the backend (non-encrypted only). */
  settings: Record<string, unknown>;
  /** Full AppSettings bundle from load_app_settings. */
  appSettings: AppSettings | null;
  isLoading: boolean;
  error: string | null;

  // Single-key operations
  getSetting: (key: string) => Promise<unknown | null>;
  setSetting: (
    key: string,
    value: unknown,
    category: string,
    encrypted?: boolean,
  ) => Promise<boolean>;
  deleteSetting: (key: string) => Promise<boolean>;

  // Batch operations
  getBatch: (keys: string[]) => Promise<Record<string, unknown>>;
  getCategory: (category: string) => Promise<Record<string, unknown>>;
  listAll: () => Promise<Record<string, unknown>>;

  // App settings bundle
  loadAppSettings: () => Promise<AppSettings | null>;
  saveAppSettings: (settings: AppSettings) => Promise<boolean>;

  // Cache management
  clearCache: () => Promise<boolean>;

  // Utility
  clearError: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useSettingsV2Store = create<SettingsV2StoreState>()(
  devtools(
    immer((set) => ({
      settings: {},
      appSettings: null,
      isLoading: false,
      error: null,

      // =====================================================================
      // Single-key Operations
      // =====================================================================

      getSetting: async (key) => {
        try {
          const value = await invoke<unknown>('settings_v2_get', { key });
          set(
            (state) => {
              state.settings[key] = value;
            },
            undefined,
            'settingsV2/get/done',
          );
          return value;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/get/error',
          );
          return null;
        }
      },

      setSetting: async (key, value, category, encrypted = false) => {
        try {
          await invoke<SettingsResponse>('settings_v2_set', {
            request: { key, value, category, encrypted },
          });
          if (!encrypted) {
            set(
              (state) => {
                state.settings[key] = value;
              },
              undefined,
              'settingsV2/set/done',
            );
          }
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/set/error',
          );
          return false;
        }
      },

      deleteSetting: async (key) => {
        try {
          await invoke<SettingsResponse>('settings_v2_delete', { key });
          set(
            (state) => {
              delete state.settings[key];
            },
            undefined,
            'settingsV2/delete/done',
          );
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/delete/error',
          );
          return false;
        }
      },

      // =====================================================================
      // Batch Operations
      // =====================================================================

      getBatch: async (keys) => {
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_get_batch', {
            request: { keys },
          });
          set(
            (state) => {
              for (const [k, v] of Object.entries(response.settings)) {
                state.settings[k] = v;
              }
            },
            undefined,
            'settingsV2/getBatch/done',
          );
          return response.settings;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/getBatch/error',
          );
          return {};
        }
      },

      getCategory: async (category) => {
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_get_category', {
            category,
          });
          set(
            (state) => {
              for (const [k, v] of Object.entries(response.settings)) {
                state.settings[k] = v;
              }
            },
            undefined,
            'settingsV2/getCategory/done',
          );
          return response.settings;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/getCategory/error',
          );
          return {};
        }
      },

      listAll: async () => {
        set(
          (state) => {
            state.isLoading = true;
          },
          undefined,
          'settingsV2/listAll/start',
        );
        try {
          const response = await invoke<GetSettingsResponse>('settings_v2_list_all');
          set(
            (state) => {
              state.settings = response.settings;
              state.isLoading = false;
            },
            undefined,
            'settingsV2/listAll/done',
          );
          return response.settings;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'settingsV2/listAll/error',
          );
          return {};
        }
      },

      // =====================================================================
      // App Settings Bundle
      // =====================================================================

      loadAppSettings: async () => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'settingsV2/loadApp/start',
        );
        try {
          const appSettings = await invoke<AppSettings>('settings_v2_load_app_settings');
          set(
            (state) => {
              state.appSettings = appSettings;
              state.isLoading = false;
            },
            undefined,
            'settingsV2/loadApp/done',
          );
          return appSettings;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'settingsV2/loadApp/error',
          );
          return null;
        }
      },

      saveAppSettings: async (settings) => {
        set(
          (state) => {
            state.isLoading = true;
          },
          undefined,
          'settingsV2/saveApp/start',
        );
        try {
          await invoke<SettingsResponse>('settings_v2_save_app_settings', { settings });
          set(
            (state) => {
              state.appSettings = settings;
              state.isLoading = false;
            },
            undefined,
            'settingsV2/saveApp/done',
          );
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'settingsV2/saveApp/error',
          );
          return false;
        }
      },

      // =====================================================================
      // Cache Management
      // =====================================================================

      clearCache: async () => {
        try {
          await invoke<SettingsResponse>('settings_v2_clear_cache');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'settingsV2/clearCache/error',
          );
          return false;
        }
      },

      // =====================================================================
      // Utility
      // =====================================================================

      clearError: () =>
        set(
          (state) => {
            state.error = null;
          },
          undefined,
          'settingsV2/clearError',
        ),
    })),
    { name: 'SettingsV2Store', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectV2Settings = (state: SettingsV2StoreState) => state.settings;
export const selectAppSettings = (state: SettingsV2StoreState) => state.appSettings;
export const selectV2Loading = (state: SettingsV2StoreState) => state.isLoading;
export const selectV2Error = (state: SettingsV2StoreState) => state.error;
