import { useState, useCallback, useEffect, useRef } from 'react';
import { checkForUpdates, relaunchApp, isTauri, listen } from '../lib/tauri-mock';
import {
  useUpdaterStore,
  shouldShowUpdateNotification,
  type UpdateStatus,
  type UpdateInfo,
  type DownloadProgress,
} from '../stores/updaterStore';

// Package version - will be replaced by build process or read from package.json
const CURRENT_VERSION_FALLBACK = '1.0.4';

interface UpdateCheckResult {
  available: boolean;
  version?: string;
  body?: string;
  date?: string;
}

export function useUpdater() {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(CURRENT_VERSION_FALLBACK);

  // Store state and actions
  const status = useUpdaterStore((state) => state.status);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const downloadProgress = useUpdaterStore((state) => state.downloadProgress);
  const error = useUpdaterStore((state) => state.error);
  const dismissedVersion = useUpdaterStore((state) => state.dismissedVersion);
  const dismissedAt = useUpdaterStore((state) => state.dismissedAt);

  const setStatus = useUpdaterStore((state) => state.setStatus);
  const setUpdateInfo = useUpdaterStore((state) => state.setUpdateInfo);
  const setDownloadProgress = useUpdaterStore((state) => state.setDownloadProgress);
  const setError = useUpdaterStore((state) => state.setError);
  const setLastCheckTime = useUpdaterStore((state) => state.setLastCheckTime);
  const dismissUpdate = useUpdaterStore((state) => state.dismissUpdate);
  const clearDismissal = useUpdaterStore((state) => state.clearDismissal);
  const reset = useUpdaterStore((state) => state.reset);

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauri) return;

    const loadVersion = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        if (mountedRef.current && version) {
          setCurrentVersion(version);
        }
      } catch (err) {
        console.warn('[useUpdater] Failed to read app version from Tauri:', err);
      }
    };

    void loadVersion();
  }, []);

  // Listen for update events from Tauri
  useEffect(() => {
    if (!isTauri) return;

    let unlistenProgress: (() => void) | null = null;
    let unlistenDownloaded: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        // Listen for download progress events
        unlistenProgress = await listen<{ downloaded: number; total: number }>(
          'tauri://update-download-progress',
          (event) => {
            if (!mountedRef.current) return;
            const { downloaded, total } = event.payload;
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            setDownloadProgress({ downloaded, total, percent });
          },
        );

        // Listen for update downloaded event
        unlistenDownloaded = await listen('tauri://update-downloaded', () => {
          if (!mountedRef.current) return;
          setStatus('downloaded');
          setIsDownloading(false);
        });

        // Listen for update error event
        unlistenError = await listen<string>('tauri://update-error', (event) => {
          if (!mountedRef.current) return;
          setError(event.payload);
          setIsDownloading(false);
        });
      } catch (err) {
        console.error('[useUpdater] Failed to setup event listeners:', err);
      }
    };

    void setupListeners();

    return () => {
      unlistenProgress?.();
      unlistenDownloaded?.();
      unlistenError?.();
    };
  }, [setDownloadProgress, setStatus, setError]);

  /**
   * Check for available updates
   */
  const doCheckForUpdates = useCallback(async (): Promise<UpdateInfo | null> => {
    if (!isTauri) {
      setStatus('up-to-date');
      return null;
    }

    setIsChecking(true);
    setError(null);
    setStatus('checking');

    try {
      const update = (await checkForUpdates()) as UpdateCheckResult | null;
      setLastCheckTime(Date.now());

      if (!mountedRef.current) return null;

      if (update?.available && update.version) {
        const info: UpdateInfo = {
          version: update.version,
          currentVersion,
          releaseNotes: update.body,
          releaseDate: update.date,
        };

        // Check if this version was dismissed recently
        if (shouldShowUpdateNotification(update.version, dismissedVersion, dismissedAt)) {
          setUpdateInfo(info);
          setStatus('available');
          return info;
        } else {
          // Version was dismissed, don't show notification
          setStatus('idle');
          return null;
        }
      } else {
        setStatus('up-to-date');
        return null;
      }
    } catch (err) {
      if (!mountedRef.current) return null;
      console.error('[useUpdater] Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      return null;
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [
    currentVersion,
    dismissedVersion,
    dismissedAt,
    setStatus,
    setError,
    setUpdateInfo,
    setLastCheckTime,
  ]);

  /**
   * Download and install the available update
   */
  const downloadAndInstall = useCallback(async (): Promise<void> => {
    if (!isTauri) {
      setError('Updates are only available in the desktop application');
      return;
    }

    setIsDownloading(true);
    setError(null);
    setStatus('downloading');
    setDownloadProgress({ downloaded: 0, total: 0, percent: 0 });

    try {
      // Dynamic import for download functionality
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!mountedRef.current) return;

      if (update?.available) {
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          if (!mountedRef.current) return;

          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                const percent = Math.round((downloaded / contentLength) * 100);
                setDownloadProgress({ downloaded, total: contentLength, percent });
              }
              break;
            case 'Finished':
              setStatus('downloaded');
              setIsDownloading(false);
              break;
          }
        });

        // Clear any dismissal for this version since user chose to update
        clearDismissal();

        // Relaunch the app to apply the update
        setStatus('installing');
        await relaunchApp();
      } else {
        setError('No update available to install');
        setStatus('error');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[useUpdater] Failed to install update:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    } finally {
      if (mountedRef.current) {
        setIsDownloading(false);
      }
    }
  }, [setStatus, setError, setDownloadProgress, clearDismissal]);

  /**
   * Dismiss the current update notification
   */
  const dismiss = useCallback(() => {
    if (updateInfo?.version) {
      dismissUpdate(updateInfo.version);
    }
  }, [updateInfo, dismissUpdate]);

  /**
   * Retry after an error
   */
  const retry = useCallback(() => {
    reset();
    void doCheckForUpdates();
  }, [reset, doCheckForUpdates]);

  return {
    // State
    status,
    updateInfo,
    downloadProgress,
    error,
    isChecking,
    isDownloading,
    currentVersion,

    // Actions
    checkForUpdates: doCheckForUpdates,
    downloadAndInstall,
    dismiss,
    retry,
    reset,
  };
}

// Re-export types for convenience
export type { UpdateStatus, UpdateInfo, DownloadProgress };
