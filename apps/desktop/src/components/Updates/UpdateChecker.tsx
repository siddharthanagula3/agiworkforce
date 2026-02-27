import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '../../lib/tauri-mock';
import { useToast } from '../../hooks/useToast';
import { useUpdater } from '../../hooks/useUpdater';
import { useUpdaterStore, waitForUpdaterHydration } from '../../stores/updaterStore';
import { ToastAction } from '../ui/Toast';
import { UpdateDialog } from './UpdateDialog';

interface UpdateCheckerProps {
  /** Delay before checking for updates on startup (ms) */
  startupDelay?: number;
  /** Callback when user clicks "Update Now" in toast */
  onUpdateNow?: () => void;
}

/**
 * UpdateChecker component
 *
 * Checks for updates on app startup and shows a toast notification
 * when an update is available. Respects user dismissal preferences.
 */
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
              altText="Update Now"
              onClick={() => {
                if (onUpdateNow) {
                  onUpdateNow();
                } else {
                  setDialogOpen(true);
                }
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Update Now
            </ToastAction>
          </div>
        ),
      });
    },
    [toast, dismissUpdate, onUpdateNow],
  );

  // Check for updates on startup
  useEffect(() => {
    // Skip update check in web mode
    if (!isTauri) {
      return;
    }

    // Don't check if auto-check is disabled
    if (!autoCheckEnabled) {
      return;
    }

    // Prevent multiple checks in the same session
    if (hasCheckedRef.current) {
      return;
    }

    let mounted = true;
    const performCheck = async () => {
      // Wait for store hydration first
      await waitForUpdaterHydration();

      if (!mounted) return;

      // Check if enough time has passed since last check
      const now = Date.now();
      const intervalMs = checkIntervalHours * 60 * 60 * 1000;

      if (lastCheckTime && now - lastCheckTime < intervalMs) {
        console.log(
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
        // Silently fail on auto-check to avoid annoying users
        if (import.meta.env.DEV) {
          console.debug('[UpdateChecker] Update check skipped:', error);
        }
      }
    };

    // Delay the check to allow app to settle
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

  // Show dialog when update is available and user clicks "Update Now"
  if (status === 'available' && updateInfo) {
    return <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
  }

  return null;
}

export default UpdateChecker;
