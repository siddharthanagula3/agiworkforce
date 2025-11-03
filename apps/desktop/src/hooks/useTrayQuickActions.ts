import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface TrayQuickActionsOptions {
  onNewConversation: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  unreadCount: number;
}

/**
 * Bridges native tray menu events into React handlers and keeps the tray badge
 * state in sync with the current unread count (placeholder for future updates).
 */
export function useTrayQuickActions({
  onNewConversation,
  onOpenSettings,
  unreadCount,
}: TrayQuickActionsOptions) {
  useEffect(() => {
    let isMounted = true;
    const cleaners: UnlistenFn[] = [];

    (async () => {
      try {
        const unlistenNewConversation = await listen('tray://new-conversation', async () => {
          if (!isMounted) {
            return;
          }
          await onNewConversation();
        });
        cleaners.push(unlistenNewConversation);

        const unlistenOpenSettings = await listen('tray://open-settings', async () => {
          if (!isMounted) {
            return;
          }
          await onOpenSettings();
        });
        cleaners.push(unlistenOpenSettings);
      } catch (error) {
        console.error('[tray] failed to register quick action listeners', error);
      }
    })();

    return () => {
      isMounted = false;
      while (cleaners.length > 0) {
        const cleaner = cleaners.pop();
        if (cleaner) {
          void cleaner();
        }
      }
    };
  }, [onNewConversation, onOpenSettings]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(unreadCount, 99));
    void invoke('tray_set_unread_badge', { count: clamped }).catch((error) => {
      console.error('[tray] failed to update unread badge', error);
    });
  }, [unreadCount]);
}
