import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useCallback } from 'react';

export type UpdateStatus = 'noupdate' | 'available' | 'downloading' | 'downloaded' | 'error';

export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus>('noupdate');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [version, setVersion] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    try {
      setError(null);
      const update = await check();
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
    try {
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

        await relaunch();
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
    checkForUpdates,
    downloadAndInstall,
  };
}
