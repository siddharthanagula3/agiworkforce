// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
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
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  error: string | null;

  autoCheckEnabled: boolean;
  checkIntervalHours: number;

  lastCheckTime: number | null;
  dismissedVersion: string | null;
  dismissedAt: number | null;

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

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

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
          }
        },
      },
    ),
    { name: 'UpdaterStore', enabled: import.meta.env.DEV },
  ),
);

export function isDismissalExpired(dismissedAt: number | null): boolean {
  if (!dismissedAt) return true;
  return Date.now() - dismissedAt > DISMISSAL_EXPIRY_MS;
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

export const selectUpdateStatus = (state: UpdaterState) => state.status;
export const selectUpdateInfo = (state: UpdaterState) => state.updateInfo;
export const selectDownloadProgress = (state: UpdaterState) => state.downloadProgress;
export const selectError = (state: UpdaterState) => state.error;
export const selectAutoCheckEnabled = (state: UpdaterState) => state.autoCheckEnabled;
