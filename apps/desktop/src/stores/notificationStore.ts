import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { notifications } from '@agiworkforce/desktop-command-client';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

export type Notification = notifications.Notification;
export type NotificationListResponse = notifications.NotificationListResponse;
export type NotificationPriority = notifications.NotificationPriority;
export type NotificationSettings = notifications.NotificationSettings;
export type NotificationType = notifications.NotificationType;

interface NotificationState {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;

  loading: boolean;
  error: string | null;

  _unlisteners: UnlistenFn[];

  list: (
    page?: number,
    pageSize?: number,
    unreadOnly?: boolean,
    notificationType?: NotificationType,
  ) => Promise<void>;
  markRead: (notificationId: string) => Promise<boolean>;
  markAllRead: () => Promise<number>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  deleteAllRead: () => Promise<number>;
  fetchUnreadCount: () => Promise<number>;

  init: () => Promise<void>;
  cleanup: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        loading: false,
        error: null,
        _unlisteners: [],

        list: async (page, pageSize, unreadOnly, notificationType) => {
          set({ loading: true, error: null }, undefined, 'notification/list/start');
          try {
            const response = await invoke<NotificationListResponse>('notification_list', {
              page: page ?? null,
              pageSize: pageSize ?? null,
              unreadOnly: unreadOnly ?? null,
              notificationType: notificationType ?? null,
            });
            set(
              {
                notifications: response.notifications,
                total: response.total,
                unreadCount: response.unreadCount,
                page: response.page,
                pageSize: response.pageSize,
                hasMore: response.hasMore,
                loading: false,
              },
              undefined,
              'notification/list/success',
            );
          } catch (err) {
            console.error('[NotificationStore] list failed:', err);
            set({ error: String(err), loading: false }, undefined, 'notification/list/error');
          }
        },

        markRead: async (notificationId) => {
          try {
            const result = await invoke<boolean>('notification_mark_read', {
              notificationId,
            });
            if (result) {
              set(
                (s) => {
                  const n = s.notifications.find((x) => x.id === notificationId);
                  if (n && !n.read) {
                    n.read = true;
                    n.readAt = new Date().toISOString();
                    s.unreadCount = Math.max(0, s.unreadCount - 1);
                  }
                },
                undefined,
                'notification/markRead',
              );
            }
            return result;
          } catch (err) {
            console.error('[NotificationStore] markRead failed:', err);
            return false;
          }
        },

        markAllRead: async () => {
          try {
            const count = await invoke<number>('notification_mark_all_read');
            set(
              (s) => {
                const now = new Date().toISOString();
                for (const n of s.notifications) {
                  if (!n.read) {
                    n.read = true;
                    n.readAt = now;
                  }
                }
                s.unreadCount = 0;
              },
              undefined,
              'notification/markAllRead',
            );
            return count;
          } catch (err) {
            console.error('[NotificationStore] markAllRead failed:', err);
            return 0;
          }
        },

        deleteNotification: async (notificationId) => {
          try {
            const result = await invoke<boolean>('notification_delete', {
              notificationId,
            });
            if (result) {
              set(
                (s) => {
                  const idx = s.notifications.findIndex((n) => n.id === notificationId);
                  if (idx >= 0) {
                    const target = s.notifications[idx];
                    if (target && !target.read) {
                      s.unreadCount = Math.max(0, s.unreadCount - 1);
                    }
                    s.notifications.splice(idx, 1);
                    s.total = Math.max(0, s.total - 1);
                  }
                },
                undefined,
                'notification/delete',
              );
            }
            return result;
          } catch (err) {
            console.error('[NotificationStore] deleteNotification failed:', err);
            return false;
          }
        },

        deleteAllRead: async () => {
          try {
            const count = await invoke<number>('notification_delete_all_read');
            set(
              (s) => {
                s.notifications = s.notifications.filter((n) => !n.read);
                s.total = s.notifications.length;
              },
              undefined,
              'notification/deleteAllRead',
            );
            return count;
          } catch (err) {
            console.error('[NotificationStore] deleteAllRead failed:', err);
            return 0;
          }
        },

        fetchUnreadCount: async () => {
          try {
            const count = await invoke<number>('notification_unread_count');
            set({ unreadCount: count }, undefined, 'notification/fetchUnreadCount');
            return count;
          } catch (err) {
            console.error('[NotificationStore] fetchUnreadCount failed:', err);
            return 0;
          }
        },

        init: async () => {
          const unlisteners: UnlistenFn[] = [];

          const unreadUn = await listen<number>('notification:unread_count', (event) => {
            set({ unreadCount: event.payload }, undefined, 'notification/event/unreadCount');
          });
          unlisteners.push(unreadUn);

          const newUn = await listen<Notification>('notification:new', (event) => {
            set(
              (s) => {
                if (s.notifications.some((n) => n.id === event.payload.id)) return;
                s.notifications.unshift(event.payload);
                s.total += 1;
              },
              undefined,
              'notification/event/new',
            );
          });
          unlisteners.push(newUn);

          const deletedUn = await listen<string>('notification:deleted', (event) => {
            set(
              (s) => {
                const idx = s.notifications.findIndex((n) => n.id === event.payload);
                if (idx >= 0) {
                  s.notifications.splice(idx, 1);
                  s.total = Math.max(0, s.total - 1);
                }
              },
              undefined,
              'notification/event/deleted',
            );
          });
          unlisteners.push(deletedUn);

          set({ _unlisteners: unlisteners }, undefined, 'notification/init');

          await get().fetchUnreadCount();
        },

        cleanup: () => {
          const { _unlisteners } = get();
          for (const unlisten of _unlisteners) {
            unlisten();
          }
          set({ _unlisteners: [] }, undefined, 'notification/cleanup');
        },
      })),
    ),
    { name: 'NotificationStore', enabled: import.meta.env.DEV },
  ),
);

export const selectNotifications = (s: NotificationState) => s.notifications;
export const selectUnreadCount = (s: NotificationState) => s.unreadCount;
export const selectHasMore = (s: NotificationState) => s.hasMore;
export const selectNotificationLoading = (s: NotificationState) => s.loading;
export const selectNotificationError = (s: NotificationState) => s.error;
