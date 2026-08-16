import { useCallback, useEffect, useRef, useState } from 'react';
import { isElectronHost, isTauri } from '../../lib/tauri-mock';
import { useToast } from '../../hooks/useToast';
import { useUpdater } from './useUpdater';
import { useUpdaterStore, waitForUpdaterHydration } from '../../stores/updaterStore';
import { ToastAction } from '@/ui/Toast';
import { UpdateDialog } from './UpdateDialog';

interface UpdateCheckerProps {
  startupDelay?: number;
  onUpdateNow?: () => void;
}

export function UpdateChecker({ startupDelay = 5000, onUpdateNow }: UpdateCheckerProps) {
  const { toast } = useToast();
  const { checkForUpdates, updateInfo, status } = useUpdater();
  const [dialogOpen, setDialogOpen] = useState(false);

  const autoCheckEnabled = useUpdaterStore((state) => state.autoCheckEnabled);
  const lastCheckTime = useUpdaterStore((state) => state.lastCheckTime);
  const checkIntervalHours = useUpdaterStore((state) => state.checkIntervalHours);
  const dismissUpdate = useUpdaterStore((state) => state.dismissUpdate);

  const hasCheckedRef = useRef(false);
  const toastShownRef = useRef(false);

  const showUpdateToast = useCallback(
    (version: string) => {
      toast({
        title: 'Update Available',
        description: `Version ${version} is ready to download.`,
        duration: Infinity, // Keep open until user interacts
        action: (
          <div className="flex gap-2">
            <ToastAction
              altText="Later"
              onClick={() => {
                dismissUpdate(version);
              }}
            >
              Later
            </ToastAction>
            <ToastAction
              altText={isElectronHost ? 'Download Installer' : 'Update Now'}
              onClick={() => {
                if (onUpdateNow) {
                  onUpdateNow();
                } else {
                  setDialogOpen(true);
                }
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isElectronHost ? 'Download Installer' : 'Update Now'}
            </ToastAction>
          </div>
        ),
      });
    },
    [toast, dismissUpdate, onUpdateNow],
  );

  useEffect(() => {
    if (!isTauri && !isElectronHost) {
      return;
    }

    if (!autoCheckEnabled) {
      return;
    }

    if (hasCheckedRef.current) {
      return;
    }

    let mounted = true;
    const performCheck = async () => {
      await waitForUpdaterHydration();

      if (!mounted) return;

      const now = Date.now();
      const intervalMs = checkIntervalHours * 60 * 60 * 1000;

      if (lastCheckTime && now - lastCheckTime < intervalMs) {
        console.debug(
          '[UpdateChecker] Skipping check, last check was',
          Math.round((now - lastCheckTime) / 1000 / 60),
          'minutes ago',
        );
        return;
      }

      hasCheckedRef.current = true;

      try {
        const info = await checkForUpdates();

        if (mounted && info && !toastShownRef.current) {
          toastShownRef.current = true;
          showUpdateToast(info.version);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('[UpdateChecker] Update check skipped:', error);
        }
      }
    };

    const timer = setTimeout(() => {
      void performCheck();
    }, startupDelay);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [
    autoCheckEnabled,
    checkIntervalHours,
    lastCheckTime,
    checkForUpdates,
    startupDelay,
    showUpdateToast,
  ]);

  if (status === 'available' && updateInfo) {
    return <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
  }

  return null;
}

export default UpdateChecker;
