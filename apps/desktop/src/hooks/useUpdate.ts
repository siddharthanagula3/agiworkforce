import { useState, useCallback } from 'react';
import { checkForUpdates, relaunchApp, isTauri } from '../lib/tauri-mock';

export type UpdateStatus = 'noupdate' | 'available' | 'downloading' | 'downloaded' | 'error';

export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus>('noupdate');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [version, setVersion] = useState<string | null>(null);

  const doCheckForUpdates = useCallback(async () => {
    if (!isTauri) {
      setStatus('noupdate');
      return null;
    }

    try {
      setError(null);
      const update = await checkForUpdates();
      if (update?.available) {
        setVersion(update.version);
        setStatus('available');
        return update;
      } else {
        setStatus('noupdate');
        return null;
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      return null;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!isTauri) {
      setError('Updates are only available in the desktop application');
      setStatus('error');
      return;
    }

    try {
      // Dynamic import for download functionality
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        setStatus('downloading');
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case 'Finished':
              setStatus('downloaded');
              break;
          }
        });

        await relaunchApp();
      }
    } catch (err) {
      console.error('Failed to install update:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  return {
    status,
    error,
    progress,
    version,
    checkForUpdates: doCheckForUpdates,
    downloadAndInstall,
  };
}
