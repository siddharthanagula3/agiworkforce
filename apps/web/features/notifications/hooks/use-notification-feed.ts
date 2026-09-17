'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationFeedItem } from '../lib/notification-target';
import { fetchNotificationFeed, markNotificationFeedRead } from '../lib/notification-feed-client';

export const NOTIFICATION_FEED_POLL_MS = 60_000;

type FeedStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NotificationFeedState {
  status: FeedStatus;
  notifications: NotificationFeedItem[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => Promise<boolean>;
}

export function useNotificationFeed(enabled: boolean): NotificationFeedState {
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [notifications, setNotifications] = useState<NotificationFeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    try {
      const feed = await fetchNotificationFeed(controller.signal);
      if (controller.signal.aborted) return;
      setNotifications(feed.notifications);
      setUnreadCount(feed.unreadCount);
      setStatus('ready');
    } catch {
      if (controller.signal.aborted) return;
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    const poll = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(poll, NOTIFICATION_FEED_POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      inFlight.current?.abort();
    };
  }, [enabled, refresh]);

  const markRead = useCallback(
    (id: string) => {
      const target = notifications.find((item) => item.id === id);
      if (!target || target.read) return;
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      void markNotificationFeedRead({ ids: [id] }).catch(() => undefined);
    },
    [notifications],
  );

  const markAllRead = useCallback(async () => {
    const previous = { notifications, unreadCount };
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await markNotificationFeedRead({ all: true });
      return true;
    } catch {
      setNotifications(previous.notifications);
      setUnreadCount(previous.unreadCount);
      return false;
    }
  }, [notifications, unreadCount]);

  return { status, notifications, unreadCount, refresh, markRead, markAllRead };
}
