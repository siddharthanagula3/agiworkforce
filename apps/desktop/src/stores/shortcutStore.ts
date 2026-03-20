/**
 * Shortcut Store
 *
 * Wires Rust shortcut commands (shortcuts.rs) to the frontend via invoke().
 * Manages global and local keyboard shortcuts, including the Quick Query hotkey.
 *
 * Rust commands wired:
 *   - shortcuts_register
 *   - shortcuts_unregister
 *   - shortcuts_list
 *   - shortcuts_update
 *   - shortcuts_trigger
 *   - shortcuts_reset
 *   - shortcuts_check_key
 *   - shortcuts_get_defaults
 *   - shortcuts_register_global
 *   - shortcuts_unregister_global
 *   - shortcuts_apply_quick_query_preferences
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs)
// =============================================================================

export interface Shortcut {
  id: string;
  key: string;
  description: string;
  action: string;
  enabled: boolean;
  isGlobal?: boolean;
}

export interface QuickQueryHotkeyPreferences {
  enabled: boolean;
  combo: string;
}

// =============================================================================
// Store State
// =============================================================================

interface ShortcutState {
  shortcuts: Shortcut[];
  defaults: Shortcut[];
  loading: boolean;
  error: string | null;
  lastTriggeredAction: string | null;

  // Event listener cleanup
  _unlisteners: UnlistenFn[];

  // === Actions: CRUD ===
  register: (shortcut: Shortcut) => Promise<void>;
  unregister: (shortcutId: string) => Promise<void>;
  list: () => Promise<Shortcut[]>;
  update: (shortcutId: string, newKey?: string, enabled?: boolean) => Promise<Shortcut>;
  trigger: (action: string) => Promise<void>;
  reset: () => Promise<Shortcut[]>;
  checkKey: (key: string) => Promise<boolean>;
  getDefaults: () => Promise<Shortcut[]>;

  // === Actions: Global Shortcuts ===
  registerGlobal: (key: string, action: string) => Promise<void>;
  unregisterGlobal: (key: string) => Promise<void>;

  // === Actions: Quick Query Hotkey ===
  applyQuickQueryPreferences: (preferences: QuickQueryHotkeyPreferences) => Promise<Shortcut>;

  // === Lifecycle ===
  init: () => Promise<void>;
  cleanup: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useShortcutStore = create<ShortcutState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        shortcuts: [],
        defaults: [],
        loading: false,
        error: null,
        lastTriggeredAction: null,
        _unlisteners: [],

        // =================================================================
        // CRUD
        // =================================================================

        register: async (shortcut) => {
          try {
            await invoke('shortcuts_register', { shortcut });
            set(
              (s) => {
                const idx = s.shortcuts.findIndex((sc) => sc.id === shortcut.id);
                if (idx >= 0) {
                  s.shortcuts[idx] = shortcut;
                } else {
                  s.shortcuts.push(shortcut);
                }
              },
              undefined,
              'shortcut/register',
            );
          } catch (err) {
            console.error('[ShortcutStore] register failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/register/error');
            throw err;
          }
        },

        unregister: async (shortcutId) => {
          try {
            await invoke('shortcuts_unregister', { shortcutId });
            set(
              (s) => {
                s.shortcuts = s.shortcuts.filter((sc) => sc.id !== shortcutId);
              },
              undefined,
              'shortcut/unregister',
            );
          } catch (err) {
            console.error('[ShortcutStore] unregister failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/unregister/error');
            throw err;
          }
        },

        list: async () => {
          set({ loading: true, error: null }, undefined, 'shortcut/list/start');
          try {
            const shortcuts = await invoke<Shortcut[]>('shortcuts_list');
            set({ shortcuts, loading: false }, undefined, 'shortcut/list/success');
            return shortcuts;
          } catch (err) {
            console.error('[ShortcutStore] list failed:', err);
            set({ error: String(err), loading: false }, undefined, 'shortcut/list/error');
            return [];
          }
        },

        update: async (shortcutId, newKey, enabled) => {
          try {
            const updated = await invoke<Shortcut>('shortcuts_update', {
              shortcutId,
              newKey: newKey ?? null,
              enabled: enabled ?? null,
            });
            set(
              (s) => {
                const idx = s.shortcuts.findIndex((sc) => sc.id === shortcutId);
                if (idx >= 0) {
                  s.shortcuts[idx] = updated;
                }
              },
              undefined,
              'shortcut/update',
            );
            return updated;
          } catch (err) {
            console.error('[ShortcutStore] update failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/update/error');
            throw err;
          }
        },

        trigger: async (action) => {
          try {
            await invoke('shortcuts_trigger', { action });
            set({ lastTriggeredAction: action }, undefined, 'shortcut/trigger');
          } catch (err) {
            console.error('[ShortcutStore] trigger failed:', err);
          }
        },

        reset: async () => {
          try {
            const shortcuts = await invoke<Shortcut[]>('shortcuts_reset');
            set({ shortcuts }, undefined, 'shortcut/reset');
            return shortcuts;
          } catch (err) {
            console.error('[ShortcutStore] reset failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/reset/error');
            return [];
          }
        },

        checkKey: async (key) => {
          try {
            return await invoke<boolean>('shortcuts_check_key', { key });
          } catch (err) {
            console.error('[ShortcutStore] checkKey failed:', err);
            return false;
          }
        },

        getDefaults: async () => {
          try {
            const defaults = await invoke<Shortcut[]>('shortcuts_get_defaults');
            set({ defaults }, undefined, 'shortcut/getDefaults');
            return defaults;
          } catch (err) {
            console.error('[ShortcutStore] getDefaults failed:', err);
            return [];
          }
        },

        // =================================================================
        // Global Shortcuts
        // =================================================================

        registerGlobal: async (key, action) => {
          try {
            await invoke('shortcuts_register_global', { key, action });
          } catch (err) {
            console.error('[ShortcutStore] registerGlobal failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/registerGlobal/error');
            throw err;
          }
        },

        unregisterGlobal: async (key) => {
          try {
            await invoke('shortcuts_unregister_global', { key });
          } catch (err) {
            console.error('[ShortcutStore] unregisterGlobal failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/unregisterGlobal/error');
            throw err;
          }
        },

        // =================================================================
        // Quick Query Hotkey
        // =================================================================

        applyQuickQueryPreferences: async (preferences) => {
          try {
            const updated = await invoke<Shortcut>('shortcuts_apply_quick_query_preferences', {
              preferences,
            });
            set(
              (s) => {
                const idx = s.shortcuts.findIndex((sc) => sc.id === 'toggle_window');
                if (idx >= 0) {
                  s.shortcuts[idx] = updated;
                } else {
                  s.shortcuts.push(updated);
                }
              },
              undefined,
              'shortcut/applyQuickQueryPreferences',
            );
            return updated;
          } catch (err) {
            console.error('[ShortcutStore] applyQuickQueryPreferences failed:', err);
            set({ error: String(err) }, undefined, 'shortcut/applyQuickQueryPreferences/error');
            throw err;
          }
        },

        // =================================================================
        // Lifecycle
        // =================================================================

        init: async () => {
          const unlisteners: UnlistenFn[] = [];

          // Listen for shortcut action events from the Rust backend
          const actionUn = await listen<string>('shortcut_action', (event) => {
            set({ lastTriggeredAction: event.payload }, undefined, 'shortcut/event/action');
          });
          unlisteners.push(actionUn);

          // Listen for shortcut registered events
          const registeredUn = await listen<Shortcut>('shortcut_registered', (event) => {
            set(
              (s) => {
                const sc = event.payload;
                const idx = s.shortcuts.findIndex((x) => x.id === sc.id);
                if (idx >= 0) {
                  s.shortcuts[idx] = sc;
                } else {
                  s.shortcuts.push(sc);
                }
              },
              undefined,
              'shortcut/event/registered',
            );
          });
          unlisteners.push(registeredUn);

          // Listen for shortcut unregistered events
          const unregisteredUn = await listen<string>('shortcut_unregistered', (event) => {
            set(
              (s) => {
                s.shortcuts = s.shortcuts.filter((sc) => sc.id !== event.payload);
              },
              undefined,
              'shortcut/event/unregistered',
            );
          });
          unlisteners.push(unregisteredUn);

          // Listen for shortcut updated events
          const updatedUn = await listen<Shortcut>('shortcut_updated', (event) => {
            set(
              (s) => {
                const sc = event.payload;
                const idx = s.shortcuts.findIndex((x) => x.id === sc.id);
                if (idx >= 0) {
                  s.shortcuts[idx] = sc;
                }
              },
              undefined,
              'shortcut/event/updated',
            );
          });
          unlisteners.push(updatedUn);

          // Listen for shortcuts reset events
          const resetUn = await listen<Shortcut[]>('shortcuts_reset', (event) => {
            set({ shortcuts: event.payload }, undefined, 'shortcut/event/reset');
          });
          unlisteners.push(resetUn);

          set({ _unlisteners: unlisteners }, undefined, 'shortcut/init');

          // Fetch initial state
          await get().list();
          await get().getDefaults();
        },

        cleanup: () => {
          const { _unlisteners } = get();
          for (const unlisten of _unlisteners) {
            unlisten();
          }
          set({ _unlisteners: [] }, undefined, 'shortcut/cleanup');
        },
      })),
    ),
    { name: 'ShortcutStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectShortcuts = (s: ShortcutState) => s.shortcuts;
export const selectShortcutDefaults = (s: ShortcutState) => s.defaults;
export const selectEnabledShortcuts = (s: ShortcutState) => s.shortcuts.filter((sc) => sc.enabled);
export const selectGlobalShortcuts = (s: ShortcutState) => s.shortcuts.filter((sc) => sc.isGlobal);
export const selectShortcutLoading = (s: ShortcutState) => s.loading;
export const selectShortcutError = (s: ShortcutState) => s.error;
export const selectLastTriggeredAction = (s: ShortcutState) => s.lastTriggeredAction;
