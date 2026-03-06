/**
 * Updater Store
 *
 * Manages application update state including update availability,
 * download progress, user preferences, and dismissal tracking.
 *
 * Uses Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

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
  // Update state
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  error: string | null;

  // User preferences
  autoCheckEnabled: boolean;
  checkIntervalHours: number;

  // Dismissal tracking
  lastCheckTime: number | null;
  dismissedVersion: string | null;
  dismissedAt: number | null;

  // Actions
  setStatus: (status: UpdateStatus) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  setError: (error: string | null) => void;

  setAutoCheckEnabled: (enabled: boolean) => void;
  setCheckIntervalHours: (hours: number) => void;

  setLastCheckTime: (time: number) => void;
  dismissUpdate: (version: string) => void;
  clearDismissal: () => void;

  reset: () => void;

  // Hydration tracking for persist middleware
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

// Dismissal expires after 24 hours
const DISMISSAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const UPDATER_STORE_VERSION = 1;

export const useUpdaterStore = create<UpdaterState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        // Initial state
        status: 'idle',
        updateInfo: null,
        downloadProgress: null,
        error: null,

        autoCheckEnabled: true,
        checkIntervalHours: 24,

        lastCheckTime: null,
        dismissedVersion: null,
        dismissedAt: null,

        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },

        setStatus: (status: UpdateStatus) => {
          set({ status });
        },

        setUpdateInfo: (info: UpdateInfo | null) => {
          set({ updateInfo: info });
        },

        setDownloadProgress: (progress: DownloadProgress | null) => {
          set({ downloadProgress: progress });
        },

        setError: (error: string | null) => {
          set({ error, status: error ? 'error' : 'idle' });
        },

        setAutoCheckEnabled: (enabled: boolean) => {
          set({ autoCheckEnabled: enabled });
        },

        setCheckIntervalHours: (hours: number) => {
          set({ checkIntervalHours: hours });
        },

        setLastCheckTime: (time: number) => {
          set({ lastCheckTime: time });
        },

        dismissUpdate: (version: string) => {
          set({
            dismissedVersion: version,
            dismissedAt: Date.now(),
            status: 'idle',
            updateInfo: null,
          });
        },

        clearDismissal: () => {
          set({
            dismissedVersion: null,
            dismissedAt: null,
          });
        },

        reset: () => {
          set({
            status: 'idle',
            updateInfo: null,
            downloadProgress: null,
            error: null,
          });
        },
      })),
      {
        name: 'agiworkforce-updater',
        version: UPDATER_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          autoCheckEnabled: state.autoCheckEnabled,
          checkIntervalHours: state.checkIntervalHours,
          lastCheckTime: state.lastCheckTime,
          dismissedVersion: state.dismissedVersion,
          dismissedAt: state.dismissedAt,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.debug('[UpdaterStore] Rehydration complete');
          }
        },
      },
    ),
    { name: 'UpdaterStore', enabled: import.meta.env.DEV },
  ),
);

/**
 * Check if the dismissal for a version has expired
 */
export function isDismissalExpired(dismissedAt: number | null): boolean {
  if (!dismissedAt) return true;
  return Date.now() - dismissedAt > DISMISSAL_EXPIRY_MS;
}

/**
 * Check if we should show the update notification for a version
 */
export function shouldShowUpdateNotification(
  version: string,
  dismissedVersion: string | null,
  dismissedAt: number | null,
): boolean {
  // If no dismissal, always show
  if (!dismissedVersion || !dismissedAt) return true;

  // If different version, show it
  if (dismissedVersion !== version) return true;

  // If dismissal expired, show it
  return isDismissalExpired(dismissedAt);
}

/**
 * Wait for updater store to finish hydrating from localStorage.
 */
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

// Selectors for optimized subscriptions
export const selectUpdateStatus = (state: UpdaterState) => state.status;
export const selectUpdateInfo = (state: UpdaterState) => state.updateInfo;
export const selectDownloadProgress = (state: UpdaterState) => state.downloadProgress;
export const selectError = (state: UpdaterState) => state.error;
export const selectAutoCheckEnabled = (state: UpdaterState) => state.autoCheckEnabled;
