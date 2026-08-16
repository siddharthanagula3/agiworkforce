// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

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

interface ShortcutState {
  shortcuts: Shortcut[];
  defaults: Shortcut[];
  loading: boolean;
  error: string | null;
  lastTriggeredAction: string | null;

  _unlisteners: UnlistenFn[];

  register: (shortcut: Shortcut) => Promise<void>;
  unregister: (shortcutId: string) => Promise<void>;
  list: () => Promise<Shortcut[]>;
  update: (shortcutId: string, newKey?: string, enabled?: boolean) => Promise<Shortcut>;
  trigger: (action: string) => Promise<void>;
  reset: () => Promise<Shortcut[]>;
  checkKey: (key: string) => Promise<boolean>;
  getDefaults: () => Promise<Shortcut[]>;

  registerGlobal: (key: string, action: string) => Promise<void>;
  unregisterGlobal: (key: string) => Promise<void>;

  applyQuickQueryPreferences: (preferences: QuickQueryHotkeyPreferences) => Promise<Shortcut>;

  init: () => Promise<void>;
  cleanup: () => void;
}

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

        init: async () => {
          const unlisteners: UnlistenFn[] = [];

          const actionUn = await listen<string>('shortcut_action', (event) => {
            set({ lastTriggeredAction: event.payload }, undefined, 'shortcut/event/action');
          });
          unlisteners.push(actionUn);

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

          const resetUn = await listen<Shortcut[]>('shortcuts_reset', (event) => {
            set({ shortcuts: event.payload }, undefined, 'shortcut/event/reset');
          });
          unlisteners.push(resetUn);

          set({ _unlisteners: unlisteners }, undefined, 'shortcut/init');

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

export const selectShortcuts = (s: ShortcutState) => s.shortcuts;
export const selectShortcutDefaults = (s: ShortcutState) => s.defaults;
export const selectEnabledShortcuts = (s: ShortcutState) => s.shortcuts.filter((sc) => sc.enabled);
export const selectGlobalShortcuts = (s: ShortcutState) => s.shortcuts.filter((sc) => sc.isGlobal);
export const selectShortcutLoading = (s: ShortcutState) => s.loading;
export const selectShortcutError = (s: ShortcutState) => s.error;
export const selectLastTriggeredAction = (s: ShortcutState) => s.lastTriggeredAction;
