import { useState, useCallback, useEffect, useRef } from 'react';
import {
  checkForUpdates,
  relaunchApp,
  isElectronHost,
  isTauri,
  listen,
} from '../../lib/tauri-mock';
import { getElectronHostBridge } from '../../lib/tauri-electron/bridgeContract';
import {
  useUpdaterStore,
  shouldShowUpdateNotification,
  type UpdateStatus,
  type UpdateInfo,
  type DownloadProgress,
} from '../../stores/updaterStore';

const CURRENT_VERSION_FALLBACK = 'Unknown';

interface UpdateCheckResult {
  available: boolean;
  currentVersion?: string;
  version?: string;
  body?: string;
  date?: string;
  downloadAndInstall?: () => Promise<void>;
}

export function useUpdater() {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(CURRENT_VERSION_FALLBACK);

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

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isElectronHost) {
      const version = getElectronHostBridge()?.appVersion.trim();
      if (version) setCurrentVersion(version);
      return;
    }
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

  useEffect(() => {
    if (!isTauri) return;

    let unlistenProgress: (() => void) | null = null;
    let unlistenDownloaded: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        unlistenProgress = await listen<{ downloaded: number; total: number }>(
          'tauri://update-download-progress',
          (event) => {
            if (!mountedRef.current) return;
            const { downloaded, total } = event.payload;
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            setDownloadProgress({ downloaded, total, percent });
          },
        );

        unlistenDownloaded = await listen('tauri://update-downloaded', () => {
          if (!mountedRef.current) return;
          setStatus('downloaded');
          setIsDownloading(false);
        });

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

  const doCheckForUpdates = useCallback(async (): Promise<UpdateInfo | null> => {
    if (!isTauri && !isElectronHost) {
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
        const installedVersion = update.currentVersion || currentVersion;
        if (update.currentVersion) setCurrentVersion(update.currentVersion);
        const info: UpdateInfo = {
          version: update.version,
          currentVersion: installedVersion,
          releaseNotes: update.body,
          releaseDate: update.date,
        };

        if (shouldShowUpdateNotification(update.version, dismissedVersion, dismissedAt)) {
          setUpdateInfo(info);
          setStatus('available');
          return info;
        } else {
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

  const downloadAndInstall = useCallback(async (): Promise<void> => {
    if (!isTauri && !isElectronHost) {
      setError('Updates are only available in the desktop application');
      return;
    }

    if (isElectronHost) {
      setError(null);
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = (await check()) as UpdateCheckResult;
        if (!update.available || !update.downloadAndInstall) {
          setStatus('up-to-date');
          return;
        }
        await update.downloadAndInstall();
        setStatus('available');
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('[useUpdater] Failed to open the AGI Cloud installer:', err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
      return;
    }

    setIsDownloading(true);
    setError(null);
    setStatus('downloading');
    setDownloadProgress({ downloaded: 0, total: 0, percent: 0 });

    try {
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

        clearDismissal();

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

  const dismiss = useCallback(() => {
    if (updateInfo?.version) {
      dismissUpdate(updateInfo.version);
    }
  }, [updateInfo, dismissUpdate]);

  const retry = useCallback(() => {
    reset();
    void doCheckForUpdates();
  }, [reset, doCheckForUpdates]);

  return {
    status,
    updateInfo,
    downloadProgress,
    error,
    isChecking,
    isDownloading,
    currentVersion,

    checkForUpdates: doCheckForUpdates,
    downloadAndInstall,
    dismiss,
    retry,
    reset,
    isManualInstallerUpdate: isElectronHost,
  };
}

export type { UpdateStatus, UpdateInfo, DownloadProgress };
