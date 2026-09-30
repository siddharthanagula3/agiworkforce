import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import {
  isProductLinkId,
  parseProductLinkPath,
  type NotificationFeedItem,
  type NotificationFeedResponse,
} from '@agiworkforce/types';
import {
  NOTIFICATIONS_PATH,
  NotificationFeedItemSchema,
  type NotificationMarkReadRequest,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { API_URL } from '@/lib/constants';
import { nativeRouteForProductLink } from './productLinks';

export const ACCOUNT_NOTIFICATIONS_PATH = NOTIFICATIONS_PATH;
const PAGE_SIZE = 30;

function isFeedItem(value: unknown): value is NotificationFeedItem {
  return NotificationFeedItemSchema.safeParse(value).success;
}

export async function fetchAccountNotifications(
  before?: string,
): Promise<NotificationFeedResponse> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (before) query.set('before', before);
  const response = await api.get<Partial<NotificationFeedResponse>>(
    `${ACCOUNT_NOTIFICATIONS_PATH}?${query.toString()}`,
  );
  const notifications = Array.isArray(response.notifications)
    ? response.notifications.filter(isFeedItem)
    : [];
  const unreadCount =
    typeof response.unreadCount === 'number' && response.unreadCount >= 0
      ? response.unreadCount
      : notifications.filter((item) => !item.read).length;
  return { notifications, unreadCount };
}

export async function markAccountNotificationsRead(
  selection: NotificationMarkReadRequest,
): Promise<void> {
  await api.patch(ACCOUNT_NOTIFICATIONS_PATH, selection);
}

export type AccountNotificationDestination =
  { kind: 'native'; route: string } | { kind: 'web'; url: string };

export function accountNotificationDestination(
  href: string | null,
): AccountNotificationDestination | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  const productLink = parseProductLinkPath(href);
  if (productLink) {
    const route = nativeRouteForProductLink(productLink);
    return route
      ? { kind: 'native', route }
      : { kind: 'web', url: new URL(href, API_URL).toString() };
  }
  const chat = /^\/chat\/([^/?#]+)$/u.exec(href);
  if (chat?.[1]) {
    let id: string;
    try {
      id = decodeURIComponent(chat[1]);
    } catch {
      return null;
    }
    if (isProductLinkId(id)) return { kind: 'native', route: `/(app)/chat/${id}` };
  }
  return { kind: 'web', url: new URL(href, API_URL).toString() };
}

interface AccountFeedState {
  items: NotificationFeedItem[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  reset: () => void;
}

const EMPTY_FEED = {
  items: [] as NotificationFeedItem[],
  unreadCount: 0,
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: null as string | null,
};

let feedGeneration = 0;

export const useAccountNotificationFeed = create<AccountFeedState>()((set, get) => ({
  ...EMPTY_FEED,

  refresh: async () => {
    const generation = ++feedGeneration;
    set({ loading: true, error: null });
    try {
      const page = await fetchAccountNotifications();
      if (generation !== feedGeneration) return;
      set({
        items: page.notifications,
        unreadCount: page.unreadCount,
        hasMore: page.notifications.length === PAGE_SIZE,
        loading: false,
      });
    } catch {
      if (generation !== feedGeneration) return;
      set({ loading: false, error: 'Could not load your account notifications.' });
    }
  },

  loadMore: async () => {
    const { items, hasMore, loading, loadingMore } = get();
    const last = items.at(-1);
    if (!hasMore || loading || loadingMore || !last) return;
    const generation = feedGeneration;
    set({ loadingMore: true });
    try {
      const page = await fetchAccountNotifications(last.createdAt);
      if (generation !== feedGeneration) return;
      const known = new Set(get().items.map((item) => item.id));
      set({
        items: [...get().items, ...page.notifications.filter((item) => !known.has(item.id))],
        unreadCount: page.unreadCount,
        hasMore: page.notifications.length === PAGE_SIZE,
        loadingMore: false,
      });
    } catch {
      if (generation !== feedGeneration) return;
      set({ loadingMore: false, error: 'Could not load older notifications.' });
    }
  },

  markRead: (id) => {
    const target = get().items.find((item) => item.id === id);
    if (!target || target.read) return;
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
    markAccountNotificationsRead({ ids: [id] }).catch(() => {
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, read: false } : item)),
        unreadCount: state.unreadCount + 1,
      }));
    });
  },

  markAllRead: () => {
    const previous = get();
    if (previous.unreadCount === 0 && previous.items.every((item) => item.read)) return;
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true })),
      unreadCount: 0,
    }));
    markAccountNotificationsRead({ all: true }).catch(() => {
      set({ items: previous.items, unreadCount: previous.unreadCount });
    });
  },

  reset: () => {
    feedGeneration += 1;
    set(EMPTY_FEED);
  },
}));

export function useAccountNotifications(enabled: boolean): AccountFeedState {
  const feed = useAccountNotificationFeed();
  const { refresh, reset } = feed;
  const load = useCallback(() => {
    reset();
    if (enabled) void refresh();
  }, [enabled, refresh, reset]);
  useEffect(load, [load]);
  return feed;
}
