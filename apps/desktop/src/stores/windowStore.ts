/**
 * Window Store
 *
 * Wires Rust window commands (window.rs) to the frontend via invoke().
 * Manages window state: maximize, fullscreen, pinned, always-on-top,
 * docking, floating window, and visibility.
 *
 * Rust commands wired:
 *   - window_get_state
 *   - window_set_pinned
 *   - window_set_always_on_top
 *   - window_set_visibility
 *   - window_dock
 *   - window_is_maximized
 *   - window_maximize
 *   - window_unmaximize
 *   - window_toggle_maximize
 *   - window_set_fullscreen
 *   - window_is_fullscreen
 *   - window_toggle_floating
 *   - window_open_floating
 *   - window_close_floating
 *   - window_is_floating_visible
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs)
// =============================================================================

export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface WindowStatePayload {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
}

// =============================================================================
// Store State
// =============================================================================

interface WindowState {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock: DockPosition | null;
  maximized: boolean;
  fullscreen: boolean;
  floatingVisible: boolean;
  loading: boolean;
  error: string | null;

  // === Actions: State Query ===
  getState: () => Promise<WindowStatePayload>;
  isMaximized: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  isFloatingVisible: () => Promise<boolean>;

  // === Actions: Window Control ===
  setPinned: (pinned: boolean) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setVisibility: (visible: boolean) => Promise<void>;
  setDock: (position: DockPosition | null) => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  toggleFullscreen: () => Promise<void>;

  // === Actions: Floating Window ===
  toggleFloating: () => Promise<boolean>;
  openFloating: () => Promise<void>;
  closeFloating: () => Promise<void>;

  // === Lifecycle ===
  init: () => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useWindowStore = create<WindowState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        pinned: false,
        alwaysOnTop: false,
        dock: null,
        maximized: false,
        fullscreen: false,
        floatingVisible: false,
        loading: false,
        error: null,

        // =================================================================
        // State Query
        // =================================================================

        getState: async () => {
          try {
            const state = await invoke<WindowStatePayload>('window_get_state');
            set(
              {
                pinned: state.pinned,
                alwaysOnTop: state.alwaysOnTop,
                dock: state.dock,
                maximized: state.maximized,
                fullscreen: state.fullscreen,
              },
              undefined,
              'window/getState',
            );
            return state;
          } catch (err) {
            console.error('[WindowStore] getState failed:', err);
            set({ error: String(err) }, undefined, 'window/getState/error');
            throw err;
          }
        },

        isMaximized: async () => {
          try {
            const maximized = await invoke<boolean>('window_is_maximized');
            set({ maximized }, undefined, 'window/isMaximized');
            return maximized;
          } catch (err) {
            console.error('[WindowStore] isMaximized failed:', err);
            return false;
          }
        },

        isFullscreen: async () => {
          try {
            const fullscreen = await invoke<boolean>('window_is_fullscreen');
            set({ fullscreen }, undefined, 'window/isFullscreen');
            return fullscreen;
          } catch (err) {
            console.error('[WindowStore] isFullscreen failed:', err);
            return false;
          }
        },

        isFloatingVisible: async () => {
          try {
            const visible = await invoke<boolean>('window_is_floating_visible');
            set({ floatingVisible: visible }, undefined, 'window/isFloatingVisible');
            return visible;
          } catch (err) {
            console.error('[WindowStore] isFloatingVisible failed:', err);
            return false;
          }
        },

        // =================================================================
        // Window Control
        // =================================================================

        setPinned: async (pinned) => {
          try {
            await invoke('window_set_pinned', { pinned });
            set({ pinned }, undefined, 'window/setPinned');
          } catch (err) {
            console.error('[WindowStore] setPinned failed:', err);
            set({ error: String(err) }, undefined, 'window/setPinned/error');
          }
        },

        setAlwaysOnTop: async (value) => {
          try {
            await invoke('window_set_always_on_top', { value });
            set({ alwaysOnTop: value }, undefined, 'window/setAlwaysOnTop');
          } catch (err) {
            console.error('[WindowStore] setAlwaysOnTop failed:', err);
            set({ error: String(err) }, undefined, 'window/setAlwaysOnTop/error');
          }
        },

        setVisibility: async (visible) => {
          try {
            await invoke('window_set_visibility', { visible });
          } catch (err) {
            console.error('[WindowStore] setVisibility failed:', err);
            set({ error: String(err) }, undefined, 'window/setVisibility/error');
          }
        },

        setDock: async (position) => {
          try {
            await invoke('window_dock', { position: position ?? null });
            set({ dock: position }, undefined, 'window/setDock');
          } catch (err) {
            console.error('[WindowStore] setDock failed:', err);
            set({ error: String(err) }, undefined, 'window/setDock/error');
          }
        },

        maximize: async () => {
          try {
            await invoke('window_maximize');
            set({ maximized: true, fullscreen: false }, undefined, 'window/maximize');
          } catch (err) {
            console.error('[WindowStore] maximize failed:', err);
            set({ error: String(err) }, undefined, 'window/maximize/error');
          }
        },

        unmaximize: async () => {
          try {
            await invoke('window_unmaximize');
            set({ maximized: false }, undefined, 'window/unmaximize');
          } catch (err) {
            console.error('[WindowStore] unmaximize failed:', err);
            set({ error: String(err) }, undefined, 'window/unmaximize/error');
          }
        },

        toggleMaximize: async () => {
          try {
            await invoke('window_toggle_maximize');
            set(
              (s) => {
                s.maximized = !s.maximized;
              },
              undefined,
              'window/toggleMaximize',
            );
          } catch (err) {
            console.error('[WindowStore] toggleMaximize failed:', err);
            set({ error: String(err) }, undefined, 'window/toggleMaximize/error');
          }
        },

        setFullscreen: async (fullscreen) => {
          try {
            await invoke('window_set_fullscreen', { fullscreen });
            set(
              {
                fullscreen,
                maximized: fullscreen ? false : get().maximized,
              },
              undefined,
              'window/setFullscreen',
            );
          } catch (err) {
            console.error('[WindowStore] setFullscreen failed:', err);
            set({ error: String(err) }, undefined, 'window/setFullscreen/error');
          }
        },

        toggleFullscreen: async () => {
          const current = get().fullscreen;
          await get().setFullscreen(!current);
        },

        // =================================================================
        // Floating Window
        // =================================================================

        toggleFloating: async () => {
          try {
            const isVisible = await invoke<boolean>('window_toggle_floating');
            set({ floatingVisible: isVisible }, undefined, 'window/toggleFloating');
            return isVisible;
          } catch (err) {
            console.error('[WindowStore] toggleFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/toggleFloating/error');
            return false;
          }
        },

        openFloating: async () => {
          try {
            await invoke('window_open_floating');
            set({ floatingVisible: true }, undefined, 'window/openFloating');
          } catch (err) {
            console.error('[WindowStore] openFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/openFloating/error');
          }
        },

        closeFloating: async () => {
          try {
            await invoke('window_close_floating');
            set({ floatingVisible: false }, undefined, 'window/closeFloating');
          } catch (err) {
            console.error('[WindowStore] closeFloating failed:', err);
            set({ error: String(err) }, undefined, 'window/closeFloating/error');
          }
        },

        // =================================================================
        // Lifecycle
        // =================================================================

        init: async () => {
          try {
            await get().getState();
            await get().isFloatingVisible();
          } catch {
            // Non-critical — window state will be fetched on demand
          }
        },
      })),
    ),
    { name: 'WindowStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectPinned = (s: WindowState) => s.pinned;
export const selectAlwaysOnTop = (s: WindowState) => s.alwaysOnTop;
export const selectDock = (s: WindowState) => s.dock;
export const selectMaximized = (s: WindowState) => s.maximized;
export const selectFullscreen = (s: WindowState) => s.fullscreen;
export const selectFloatingVisible = (s: WindowState) => s.floatingVisible;
export const selectWindowLoading = (s: WindowState) => s.loading;
export const selectWindowError = (s: WindowState) => s.error;

// ============================================================================
// Shortcut Store (absorbed from shortcutStore.ts — task-w58)
// ============================================================================

import { subscribeWithSelector as shortcutSWS } from 'zustand/middleware';
import { immer as shortcutImmer } from 'zustand/middleware/immer';
import { listen as shortcutListen } from '../lib/tauri-mock';

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
    shortcutSWS(
      shortcutImmer((set, get) => ({
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
                if (idx >= 0) s.shortcuts[idx] = shortcut;
                else s.shortcuts.push(shortcut);
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
            const shortcuts = (await invoke('shortcuts_list')) as Shortcut[];
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
            const updated = (await invoke('shortcuts_update', {
              shortcutId,
              newKey: newKey ?? null,
              enabled: enabled ?? null,
            })) as Shortcut;
            set(
              (s) => {
                const idx = s.shortcuts.findIndex((sc) => sc.id === shortcutId);
                if (idx >= 0) s.shortcuts[idx] = updated;
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
            const shortcuts = (await invoke('shortcuts_reset')) as Shortcut[];
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
            return (await invoke('shortcuts_check_key', { key })) as boolean;
          } catch (err) {
            console.error('[ShortcutStore] checkKey failed:', err);
            return false;
          }
        },

        getDefaults: async () => {
          try {
            const defaults = (await invoke('shortcuts_get_defaults')) as Shortcut[];
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
            const updated = (await invoke('shortcuts_apply_quick_query_preferences', {
              preferences,
            })) as Shortcut;
            set(
              (s) => {
                const idx = s.shortcuts.findIndex((sc) => sc.id === 'toggle_window');
                if (idx >= 0) s.shortcuts[idx] = updated;
                else s.shortcuts.push(updated);
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
          const actionUn = await shortcutListen<string>('shortcut_action', (event) => {
            set({ lastTriggeredAction: event.payload }, undefined, 'shortcut/event/action');
          });
          unlisteners.push(actionUn);
          const registeredUn = await shortcutListen<Shortcut>('shortcut_registered', (event) => {
            set(
              (s) => {
                const sc = event.payload;
                const idx = s.shortcuts.findIndex((x) => x.id === sc.id);
                if (idx >= 0) s.shortcuts[idx] = sc;
                else s.shortcuts.push(sc);
              },
              undefined,
              'shortcut/event/registered',
            );
          });
          unlisteners.push(registeredUn);
          const unregisteredUn = await shortcutListen<string>('shortcut_unregistered', (event) => {
            set(
              (s) => {
                s.shortcuts = s.shortcuts.filter((sc) => sc.id !== event.payload);
              },
              undefined,
              'shortcut/event/unregistered',
            );
          });
          unlisteners.push(unregisteredUn);
          const updatedUn = await shortcutListen<Shortcut>('shortcut_updated', (event) => {
            set(
              (s) => {
                const sc = event.payload;
                const idx = s.shortcuts.findIndex((x) => x.id === sc.id);
                if (idx >= 0) s.shortcuts[idx] = sc;
              },
              undefined,
              'shortcut/event/updated',
            );
          });
          unlisteners.push(updatedUn);
          const resetUn = await shortcutListen<Shortcut[]>('shortcuts_reset', (event) => {
            set({ shortcuts: event.payload }, undefined, 'shortcut/event/reset');
          });
          unlisteners.push(resetUn);
          set({ _unlisteners: unlisteners }, undefined, 'shortcut/init');
          await get().list();
          await get().getDefaults();
        },

        cleanup: () => {
          const { _unlisteners } = get();
          for (const unlisten of _unlisteners) unlisten();
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

// ============================================================================
// Updater Store (absorbed from updaterStore.ts — task-w58)
// ============================================================================

import {
  persist as updPersist,
  subscribeWithSelector as updSWS,
  createJSONStorage as updJSONStorage,
} from 'zustand/middleware';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'up-to-date';
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  releaseDate?: string;
  mandatory?: boolean;
}
export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

interface UpdaterState {
  updStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  updError: string | null;
  autoCheckEnabled: boolean;
  checkIntervalHours: number;
  lastCheckTime: number | null;
  dismissedVersion: string | null;
  dismissedAt: number | null;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setStatus: (status: UpdateStatus) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  setUpdError: (error: string | null) => void;
  setAutoCheckEnabled: (enabled: boolean) => void;
  setCheckIntervalHours: (hours: number) => void;
  setLastCheckTime: (time: number) => void;
  dismissUpdate: (version: string) => void;
  clearDismissal: () => void;
  resetUpdater: () => void;
}

const UPD_DISMISSAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const useUpdaterStore = create<UpdaterState>()(
  devtools(
    updPersist(
      updSWS((set) => ({
        updStatus: 'idle',
        updateInfo: null,
        downloadProgress: null,
        updError: null,
        autoCheckEnabled: true,
        checkIntervalHours: 24,
        lastCheckTime: null,
        dismissedVersion: null,
        dismissedAt: null,
        _hasHydrated: false,
        setHasHydrated: (state) => set({ _hasHydrated: state }),
        setStatus: (updStatus) => set({ updStatus }),
        setUpdateInfo: (updateInfo) => set({ updateInfo }),
        setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
        setUpdError: (updError) => set({ updError, updStatus: updError ? 'error' : 'idle' }),
        setAutoCheckEnabled: (autoCheckEnabled) => set({ autoCheckEnabled }),
        setCheckIntervalHours: (checkIntervalHours) => set({ checkIntervalHours }),
        setLastCheckTime: (lastCheckTime) => set({ lastCheckTime }),
        dismissUpdate: (version) =>
          set({
            dismissedVersion: version,
            dismissedAt: Date.now(),
            updStatus: 'idle',
            updateInfo: null,
          }),
        clearDismissal: () => set({ dismissedVersion: null, dismissedAt: null }),
        resetUpdater: () =>
          set({ updStatus: 'idle', updateInfo: null, downloadProgress: null, updError: null }),
      })),
      {
        name: 'agiworkforce-updater',
        version: 1,
        storage: updJSONStorage(() =>
          typeof window === 'undefined'
            ? ({
                get length() {
                  return 0;
                },
                clear: () => undefined,
                getItem: () => null,
                key: () => null,
                removeItem: () => undefined,
                setItem: () => undefined,
              } as Storage)
            : window.localStorage,
        ),
        partialize: (state) => ({
          autoCheckEnabled: state.autoCheckEnabled,
          checkIntervalHours: state.checkIntervalHours,
          lastCheckTime: state.lastCheckTime,
          dismissedVersion: state.dismissedVersion,
          dismissedAt: state.dismissedAt,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) state.setHasHydrated(true);
        },
      },
    ),
    { name: 'UpdaterStore', enabled: import.meta.env.DEV },
  ),
);

export function isDismissalExpired(dismissedAt: number | null): boolean {
  if (!dismissedAt) return true;
  return Date.now() - dismissedAt > UPD_DISMISSAL_EXPIRY_MS;
}
export function shouldShowUpdateNotification(
  version: string,
  dismissedVersion: string | null,
  dismissedAt: number | null,
): boolean {
  if (!dismissedVersion || !dismissedAt) return true;
  if (dismissedVersion !== version) return true;
  return isDismissalExpired(dismissedAt);
}
export function waitForUpdaterHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useUpdaterStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useUpdaterStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
export const selectUpdateStatus = (state: UpdaterState) => state.updStatus;
export const selectUpdateInfo = (state: UpdaterState) => state.updateInfo;
export const selectDownloadProgress = (state: UpdaterState) => state.downloadProgress;
export const selectUpdError = (state: UpdaterState) => state.updError;
export const selectAutoCheckEnabled = (state: UpdaterState) => state.autoCheckEnabled;

// =============================================================================
// Notification Store (absorbed from notificationStore.ts — task-w58)
// =============================================================================

export interface NotificationAction {
  id: string;
  title: string;
}

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  scheduledAt: string;
  delivered: boolean;
  actions: NotificationAction[] | null;
  category: string | null;
}

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationType =
  | 'system'
  | 'task_complete'
  | 'task_failed'
  | 'agent_activity'
  | 'mcp_server'
  | 'reminder'
  | 'achievement'
  | 'team'
  | 'info'
  | 'warning'
  | 'error';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
  readAt: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  dismissible: boolean;
  expiresAt: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  badgeEnabled: boolean;
  desktopNotifications: boolean;
  enabledTypes: NotificationType[];
  doNotDisturb: boolean;
  dndStartTime: string | null;
  dndEndTime: string | null;
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  actionUrl?: string;
  actionLabel?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  dismissible?: boolean;
  expiresAt?: string;
}

interface NotificationState {
  permissionGranted: boolean;
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  settings: NotificationSettings | null;
  unreadCounts: Record<string, number>;
  scheduled: ScheduledNotification[];
  loading: boolean;
  error: string | null;
  _unlisteners: UnlistenFn[];

  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
  show: (title: string, body: string, icon?: string) => Promise<void>;
  showWithActions: (title: string, body: string, actions: NotificationAction[]) => Promise<string>;
  schedule: (
    title: string,
    body: string,
    at: string,
    icon?: string,
    category?: string,
  ) => Promise<string>;
  scheduleReminder: (
    title: string,
    body: string,
    at: string,
    actions?: NotificationAction[],
  ) => Promise<string>;
  cancelScheduled: (notificationId: string) => Promise<void>;
  cancelAllScheduled: () => Promise<number>;
  getScheduled: () => Promise<ScheduledNotification[]>;
  getScheduledById: (notificationId: string) => Promise<ScheduledNotification | null>;
  updateScheduled: (
    notificationId: string,
    title?: string,
    body?: string,
    at?: string,
  ) => Promise<ScheduledNotification>;
  registerActions: (actions: NotificationAction[]) => Promise<void>;
  incrementUnread: (conversationId: string) => void;
  markConversationRead: (conversationId: string) => void;
  clearAllUnread: () => void;
  list: (
    page?: number,
    pageSize?: number,
    unreadOnly?: boolean,
    notificationType?: NotificationType,
  ) => Promise<void>;
  markRead: (notificationId: string) => Promise<boolean>;
  markAllRead: () => Promise<number>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  deleteAllRead: () => Promise<number>;
  getSettings: () => Promise<NotificationSettings>;
  setSettings: (settings: NotificationSettings) => Promise<void>;
  create: (input: CreateNotificationInput) => Promise<Notification>;
  fetchUnreadCount: () => Promise<number>;
  init: () => Promise<void>;
  cleanup: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        permissionGranted: false,
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        settings: null,
        unreadCounts: {},
        scheduled: [],
        loading: false,
        error: null,
        _unlisteners: [],

        checkPermission: async () => {
          try {
            const granted = await invoke<boolean>('notification_check_permission');
            set({ permissionGranted: granted }, undefined, 'notification/checkPermission');
            return granted;
          } catch (err) {
            console.error('[NotificationStore] checkPermission failed:', err);
            return false;
          }
        },
        requestPermission: async () => {
          try {
            const s = await invoke<string>('notification_request_permission');
            set(
              { permissionGranted: s === 'granted' },
              undefined,
              'notification/requestPermission',
            );
            return s;
          } catch (err) {
            console.error('[NotificationStore] requestPermission failed:', err);
            return 'denied';
          }
        },
        show: async (title, body, icon) => {
          try {
            await invoke('notification_show', { title, body, icon: icon ?? null });
          } catch (err) {
            console.error('[NotificationStore] show failed:', err);
            set({ error: String(err) }, undefined, 'notification/show/error');
          }
        },
        showWithActions: async (title, body, actions) => {
          try {
            return await invoke<string>('notification_show_with_actions', { title, body, actions });
          } catch (err) {
            console.error('[NotificationStore] showWithActions failed:', err);
            set({ error: String(err) }, undefined, 'notification/showWithActions/error');
            return '';
          }
        },
        schedule: async (title, body, at, icon, category) => {
          try {
            const id = await invoke<string>('notification_schedule', {
              title,
              body,
              at,
              icon: icon ?? null,
              category: category ?? null,
            });
            await get().getScheduled();
            return id;
          } catch (err) {
            console.error('[NotificationStore] schedule failed:', err);
            set({ error: String(err) }, undefined, 'notification/schedule/error');
            return '';
          }
        },
        scheduleReminder: async (title, body, at, actions) => {
          try {
            const id = await invoke<string>('notification_schedule_reminder', {
              title,
              body,
              at,
              actions: actions ?? null,
            });
            await get().getScheduled();
            return id;
          } catch (err) {
            console.error('[NotificationStore] scheduleReminder failed:', err);
            set({ error: String(err) }, undefined, 'notification/scheduleReminder/error');
            return '';
          }
        },
        cancelScheduled: async (notificationId) => {
          try {
            await invoke('notification_cancel', { notificationId });
            set(
              (s) => {
                s.scheduled = s.scheduled.filter((n) => n.id !== notificationId);
              },
              undefined,
              'notification/cancelScheduled',
            );
          } catch (err) {
            console.error('[NotificationStore] cancelScheduled failed:', err);
            set({ error: String(err) }, undefined, 'notification/cancelScheduled/error');
          }
        },
        cancelAllScheduled: async () => {
          try {
            const count = await invoke<number>('notification_cancel_all');
            set({ scheduled: [] }, undefined, 'notification/cancelAllScheduled');
            return count;
          } catch (err) {
            console.error('[NotificationStore] cancelAllScheduled failed:', err);
            set({ error: String(err) }, undefined, 'notification/cancelAllScheduled/error');
            return 0;
          }
        },
        getScheduled: async () => {
          try {
            const scheduled = await invoke<ScheduledNotification[]>('notification_get_scheduled');
            set({ scheduled }, undefined, 'notification/getScheduled');
            return scheduled;
          } catch (err) {
            console.error('[NotificationStore] getScheduled failed:', err);
            return [];
          }
        },
        getScheduledById: async (notificationId) => {
          try {
            return await invoke<ScheduledNotification | null>('notification_get', {
              notificationId,
            });
          } catch (err) {
            console.error('[NotificationStore] getScheduledById failed:', err);
            return null;
          }
        },
        updateScheduled: async (notificationId, title, body, at) => {
          try {
            const updated = await invoke<ScheduledNotification>('notification_update', {
              notificationId,
              title: title ?? null,
              body: body ?? null,
              at: at ?? null,
            });
            set(
              (s) => {
                const idx = s.scheduled.findIndex((n) => n.id === notificationId);
                if (idx >= 0) s.scheduled[idx] = updated;
              },
              undefined,
              'notification/updateScheduled',
            );
            return updated;
          } catch (err) {
            console.error('[NotificationStore] updateScheduled failed:', err);
            throw err;
          }
        },
        registerActions: async (actions) => {
          try {
            await invoke('notification_register_actions', { actions });
          } catch (err) {
            console.error('[NotificationStore] registerActions failed:', err);
          }
        },
        incrementUnread: (conversationId) => {
          set(
            (s) => {
              s.unreadCounts[conversationId] = (s.unreadCounts[conversationId] ?? 0) + 1;
            },
            undefined,
            'notification/incrementUnread',
          );
        },
        markConversationRead: (conversationId) => {
          set(
            (s) => {
              delete s.unreadCounts[conversationId];
            },
            undefined,
            'notification/markConversationRead',
          );
        },
        clearAllUnread: () => {
          set({ unreadCounts: {} }, undefined, 'notification/clearAllUnread');
        },
        list: async (page, pageSize, unreadOnly, notificationType) => {
          set({ loading: true, error: null }, undefined, 'notification/list/start');
          try {
            const response = await invoke<NotificationListResponse>('notification_list', {
              page: page ?? null,
              pageSize: pageSize ?? null,
              unreadOnly: unreadOnly ?? null,
              notificationType: notificationType ?? null,
            });
            set(
              {
                notifications: response.notifications,
                total: response.total,
                unreadCount: response.unreadCount,
                page: response.page,
                pageSize: response.pageSize,
                hasMore: response.hasMore,
                loading: false,
              },
              undefined,
              'notification/list/success',
            );
          } catch (err) {
            console.error('[NotificationStore] list failed:', err);
            set({ error: String(err), loading: false }, undefined, 'notification/list/error');
          }
        },
        markRead: async (notificationId) => {
          try {
            const result = await invoke<boolean>('notification_mark_read', { notificationId });
            if (result)
              set(
                (s) => {
                  const n = s.notifications.find((x) => x.id === notificationId);
                  if (n && !n.read) {
                    n.read = true;
                    n.readAt = new Date().toISOString();
                    s.unreadCount = Math.max(0, s.unreadCount - 1);
                  }
                },
                undefined,
                'notification/markRead',
              );
            return result;
          } catch (err) {
            console.error('[NotificationStore] markRead failed:', err);
            return false;
          }
        },
        markAllRead: async () => {
          try {
            const count = await invoke<number>('notification_mark_all_read');
            set(
              (s) => {
                const now = new Date().toISOString();
                for (const n of s.notifications) {
                  if (!n.read) {
                    n.read = true;
                    n.readAt = now;
                  }
                }
                s.unreadCount = 0;
              },
              undefined,
              'notification/markAllRead',
            );
            return count;
          } catch (err) {
            console.error('[NotificationStore] markAllRead failed:', err);
            return 0;
          }
        },
        deleteNotification: async (notificationId) => {
          try {
            const result = await invoke<boolean>('notification_delete', { notificationId });
            if (result)
              set(
                (s) => {
                  const idx = s.notifications.findIndex((n) => n.id === notificationId);
                  if (idx >= 0) {
                    const target = s.notifications[idx];
                    if (target && !target.read) s.unreadCount = Math.max(0, s.unreadCount - 1);
                    s.notifications.splice(idx, 1);
                    s.total = Math.max(0, s.total - 1);
                  }
                },
                undefined,
                'notification/delete',
              );
            return result;
          } catch (err) {
            console.error('[NotificationStore] deleteNotification failed:', err);
            return false;
          }
        },
        deleteAllRead: async () => {
          try {
            const count = await invoke<number>('notification_delete_all_read');
            set(
              (s) => {
                s.notifications = s.notifications.filter((n) => !n.read);
                s.total = s.notifications.length;
              },
              undefined,
              'notification/deleteAllRead',
            );
            return count;
          } catch (err) {
            console.error('[NotificationStore] deleteAllRead failed:', err);
            return 0;
          }
        },
        getSettings: async () => {
          try {
            const settings = await invoke<NotificationSettings>('notification_get_settings');
            set({ settings }, undefined, 'notification/getSettings');
            return settings;
          } catch (err) {
            console.error('[NotificationStore] getSettings failed:', err);
            throw err;
          }
        },
        setSettings: async (settings) => {
          try {
            await invoke('notification_set_settings', { settings });
            set({ settings }, undefined, 'notification/setSettings');
          } catch (err) {
            console.error('[NotificationStore] setSettings failed:', err);
            set({ error: String(err) }, undefined, 'notification/setSettings/error');
          }
        },
        create: async (input) => {
          try {
            const notification = await invoke<Notification>('notification_create', { input });
            set(
              (s) => {
                s.notifications.unshift(notification);
                s.total += 1;
                if (!notification.read) s.unreadCount += 1;
              },
              undefined,
              'notification/create',
            );
            return notification;
          } catch (err) {
            console.error('[NotificationStore] create failed:', err);
            throw err;
          }
        },
        fetchUnreadCount: async () => {
          try {
            const count = await invoke<number>('notification_unread_count');
            set({ unreadCount: count }, undefined, 'notification/fetchUnreadCount');
            return count;
          } catch (err) {
            console.error('[NotificationStore] fetchUnreadCount failed:', err);
            return 0;
          }
        },
        init: async () => {
          const unlisteners: UnlistenFn[] = [];
          const unreadUn = await listen<number>('notification:unread_count', (event) => {
            set({ unreadCount: event.payload }, undefined, 'notification/event/unreadCount');
          });
          unlisteners.push(unreadUn);
          const newUn = await listen<Notification>('notification:new', (event) => {
            set(
              (s) => {
                s.notifications.unshift(event.payload);
                s.total += 1;
              },
              undefined,
              'notification/event/new',
            );
          });
          unlisteners.push(newUn);
          const deletedUn = await listen<string>('notification:deleted', (event) => {
            set(
              (s) => {
                const idx = s.notifications.findIndex((n) => n.id === event.payload);
                if (idx >= 0) {
                  s.notifications.splice(idx, 1);
                  s.total = Math.max(0, s.total - 1);
                }
              },
              undefined,
              'notification/event/deleted',
            );
          });
          unlisteners.push(deletedUn);
          set({ _unlisteners: unlisteners }, undefined, 'notification/init');
          await get().checkPermission();
          await get().fetchUnreadCount();
        },
        cleanup: () => {
          const { _unlisteners } = get();
          for (const unlisten of _unlisteners) unlisten();
          set({ _unlisteners: [] }, undefined, 'notification/cleanup');
        },
      })),
    ),
    { name: 'NotificationStore', enabled: import.meta.env.DEV },
  ),
);

export const selectPermissionGranted = (s: NotificationState) => s.permissionGranted;
export const selectNotifications = (s: NotificationState) => s.notifications;
export const selectUnreadCount = (s: NotificationState) => s.unreadCount;
export const selectNotificationTotal = (s: NotificationState) => s.total;
export const selectHasMore = (s: NotificationState) => s.hasMore;
export const selectNotificationSettings = (s: NotificationState) => s.settings;
export const selectScheduledNotifications = (s: NotificationState) => s.scheduled;
export const selectNotificationLoading = (s: NotificationState) => s.loading;
export const selectNotificationError = (s: NotificationState) => s.error;
export const selectUnreadCounts = (s: NotificationState) => s.unreadCounts;
export const selectConversationUnreadCount =
  (conversationId: string) =>
  (s: NotificationState): number =>
    s.unreadCounts[conversationId] ?? 0;
export const selectTotalConversationUnread = (s: NotificationState): number =>
  Object.values(s.unreadCounts).reduce((acc, n) => acc + n, 0);
