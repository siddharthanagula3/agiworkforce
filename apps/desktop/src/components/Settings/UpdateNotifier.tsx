import { useEffect } from 'react';
import { checkForUpdates, isTauri } from '../../lib/tauri-mock';
import { useToast } from '../../hooks/useToast';
import { ToastAction } from '../ui/Toast';

interface UpdateNotifierProps {
  onOpenSettings: () => void;
}

const UPDATE_REMINDER_KEY = 'agiworkforce_update_reminder';
const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function UpdateNotifier({ onOpenSettings }: UpdateNotifierProps) {
  const { toast } = useToast();

  useEffect(() => {
    // Skip update check in web mode
    if (!isTauri) {
      return;
    }

    let mounted = true;

    const doCheckForUpdates = async () => {
      try {
        const lastReminded = localStorage.getItem(UPDATE_REMINDER_KEY);
        if (lastReminded) {
          const lastRemindedTime = parseInt(lastReminded, 10);
          if (Date.now() - lastRemindedTime < REMINDER_DELAY_MS) {
            console.log(
              'Update reminder snoozed until:',
              new Date(lastRemindedTime + REMINDER_DELAY_MS),
            );
            return;
          }
        }

        const update = await checkForUpdates();
        if (mounted && update?.available) {
          toast({
            title: 'Update Available',
            description: `Version ${update.version} is available.`,
            duration: Infinity, // Keep open until interaction
            action: (
              <div className="flex gap-2">
                <ToastAction
                  altText="Later"
                  onClick={() => {
                    localStorage.setItem(UPDATE_REMINDER_KEY, Date.now().toString());
                  }}
                >
                  Later
                </ToastAction>
                <ToastAction
                  altText="Update Now"
                  onClick={onOpenSettings}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Update Now
                </ToastAction>
              </div>
            ),
          });
        }
      } catch (error) {
        // Silently fail on auto-check to avoid annoying users with network errors on startup
        console.error('Failed to check for updates:', error);
      }
    };

    // Check after a short delay to allow app to settle
    const timer = setTimeout(() => {
      void doCheckForUpdates();
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [toast, onOpenSettings]);

  return null;
}
