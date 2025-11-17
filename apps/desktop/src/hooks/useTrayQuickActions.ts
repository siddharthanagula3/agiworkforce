import { useEffect, useRef } from 'react';
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
 *
 * Updated Nov 16, 2025: Fixed missing dependencies by using useRef for callbacks
 */
export function useTrayQuickActions({
  onNewConversation,
  onOpenSettings,
  unreadCount,
}: TrayQuickActionsOptions) {
  // Store callbacks in refs to avoid recreating event listeners
  const onNewConversationRef = useRef(onNewConversation);
  const onOpenSettingsRef = useRef(onOpenSettings);

  // Keep refs up to date
  useEffect(() => {
    onNewConversationRef.current = onNewConversation;
    onOpenSettingsRef.current = onOpenSettings;
  }, [onNewConversation, onOpenSettings]);

  useEffect(() => {
    let isMounted = true;
    const cleaners: UnlistenFn[] = [];

    (async () => {
      try {
        const unlistenNewConversation = await listen('tray://new-conversation', async () => {
          if (!isMounted) {
            return;
          }
          await onNewConversationRef.current();
        });
        cleaners.push(unlistenNewConversation);

        const unlistenOpenSettings = await listen('tray://open-settings', async () => {
          if (!isMounted) {
            return;
          }
          await onOpenSettingsRef.current();
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
  }, []); // Empty deps - listeners are stable, refs handle updates

  useEffect(() => {
    const clamped = Math.max(0, Math.min(unreadCount, 99));
    void invoke('tray_set_unread_badge', { count: clamped }).catch((error) => {
      console.error('[tray] failed to update unread badge', error);
    });
  }, [unreadCount]);
}
