/**
 * Notification Store
 *
 * Wires Rust notification commands (notifications.rs + notification_center.rs)
 * to the frontend via invoke(). Covers both OS-level desktop notifications
 * and the in-app notification center.
 *
 * Rust commands wired:
 *   notifications.rs:
 *     - notification_check_permission
 *     - notification_request_permission
 *     - notification_show
 *     - notification_show_with_actions
 *     - notification_schedule
 *     - notification_schedule_reminder
 *     - notification_cancel
 *     - notification_cancel_all
 *     - notification_get_scheduled
 *     - notification_get
 *     - notification_update
 *     - notification_register_actions
 *   notification_center.rs:
 *     - notification_list
 *     - notification_mark_read
 *     - notification_mark_all_read
 *     - notification_delete
 *     - notification_delete_all_read
 *     - notification_get_settings
 *     - notification_set_settings
 *     - notification_create
 *     - notification_unread_count
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

// =============================================================================
// Types (mirror Rust structs — camelCase for TS convention)
// =============================================================================

export interface NotificationAction {
  id: string;
  title: string;
}

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  scheduledAt: string;
  delivered: boolean;
  actions: NotificationAction[] | null;
  category: string | null;
}

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationType =
  | 'system'
  | 'task_complete'
  | 'task_failed'
  | 'agent_activity'
  | 'mcp_server'
  | 'reminder'
  | 'achievement'
  | 'team'
  | 'info'
  | 'warning'
  | 'error';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
  readAt: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  dismissible: boolean;
  expiresAt: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  badgeEnabled: boolean;
  desktopNotifications: boolean;
  enabledTypes: NotificationType[];
  doNotDisturb: boolean;
  dndStartTime: string | null;
  dndEndTime: string | null;
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  actionUrl?: string;
  actionLabel?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  dismissible?: boolean;
  expiresAt?: string;
}

// =============================================================================
// Store State
// =============================================================================

interface NotificationState {
  // Permission
  permissionGranted: boolean;

  // In-app notification center
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  settings: NotificationSettings | null;

  // Per-conversation unread badge counts (conversationId → count)
  unreadCounts: Record<string, number>;

  // Scheduled (OS-level)
  scheduled: ScheduledNotification[];

  // Loading flags
  loading: boolean;
  error: string | null;

  // Event listener cleanup
  _unlisteners: UnlistenFn[];

  // === Actions: Permission ===
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<string>;

  // === Actions: OS Notifications ===
  show: (title: string, body: string, icon?: string) => Promise<void>;
  showWithActions: (title: string, body: string, actions: NotificationAction[]) => Promise<string>;
  schedule: (
    title: string,
    body: string,
    at: string,
    icon?: string,
    category?: string,
  ) => Promise<string>;
  scheduleReminder: (
    title: string,
    body: string,
    at: string,
    actions?: NotificationAction[],
  ) => Promise<string>;
  cancelScheduled: (notificationId: string) => Promise<void>;
  cancelAllScheduled: () => Promise<number>;
  getScheduled: () => Promise<ScheduledNotification[]>;
  getScheduledById: (notificationId: string) => Promise<ScheduledNotification | null>;
  updateScheduled: (
    notificationId: string,
    title?: string,
    body?: string,
    at?: string,
  ) => Promise<ScheduledNotification>;
  registerActions: (actions: NotificationAction[]) => Promise<void>;

  // === Actions: Per-conversation unread tracking ===
  incrementUnread: (conversationId: string) => void;
  markConversationRead: (conversationId: string) => void;
  clearAllUnread: () => void;

  // === Actions: Notification Center ===
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
  getSettings: () => Promise<NotificationSettings>;
  setSettings: (settings: NotificationSettings) => Promise<void>;
  create: (input: CreateNotificationInput) => Promise<Notification>;
  fetchUnreadCount: () => Promise<number>;

  // === Lifecycle ===
  init: () => Promise<void>;
  cleanup: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useNotificationStore = create<NotificationState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        permissionGranted: false,
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        settings: null,
        unreadCounts: {},
        scheduled: [],
        loading: false,
        error: null,
        _unlisteners: [],

        // =================================================================
        // Permission
        // =================================================================

        checkPermission: async () => {
          try {
            const granted = await invoke<boolean>('notification_check_permission');
            set({ permissionGranted: granted }, undefined, 'notification/checkPermission');
            return granted;
          } catch (err) {
            console.error('[NotificationStore] checkPermission failed:', err);
            return false;
          }
        },

        requestPermission: async () => {
          try {
            const state = await invoke<string>('notification_request_permission');
            set(
              { permissionGranted: state === 'granted' },
              undefined,
              'notification/requestPermission',
            );
            return state;
          } catch (err) {
            console.error('[NotificationStore] requestPermission failed:', err);
            return 'denied';
          }
        },

        // =================================================================
        // OS Notifications
        // =================================================================

        show: async (title, body, icon) => {
          try {
            await invoke('notification_show', { title, body, icon: icon ?? null });
          } catch (err) {
            console.error('[NotificationStore] show failed:', err);
            set({ error: String(err) }, undefined, 'notification/show/error');
          }
        },

        showWithActions: async (title, body, actions) => {
          try {
            return await invoke<string>('notification_show_with_actions', {
              title,
              body,
              actions,
            });
          } catch (err) {
            console.error('[NotificationStore] showWithActions failed:', err);
            set({ error: String(err) }, undefined, 'notification/showWithActions/error');
            return '';
          }
        },

        schedule: async (title, body, at, icon, category) => {
          try {
            const id = await invoke<string>('notification_schedule', {
              title,
              body,
              at,
              icon: icon ?? null,
              category: category ?? null,
            });
            // Refresh scheduled list
            await get().getScheduled();
            return id;
          } catch (err) {
            console.error('[NotificationStore] schedule failed:', err);
            set({ error: String(err) }, undefined, 'notification/schedule/error');
            return '';
          }
        },

        scheduleReminder: async (title, body, at, actions) => {
          try {
            const id = await invoke<string>('notification_schedule_reminder', {
              title,
              body,
              at,
              actions: actions ?? null,
            });
            await get().getScheduled();
            return id;
          } catch (err) {
            console.error('[NotificationStore] scheduleReminder failed:', err);
            set({ error: String(err) }, undefined, 'notification/scheduleReminder/error');
            return '';
          }
        },

        cancelScheduled: async (notificationId) => {
          try {
            await invoke('notification_cancel', { notificationId });
            set(
              (s) => {
                s.scheduled = s.scheduled.filter((n) => n.id !== notificationId);
              },
              undefined,
              'notification/cancelScheduled',
            );
          } catch (err) {
            console.error('[NotificationStore] cancelScheduled failed:', err);
            set({ error: String(err) }, undefined, 'notification/cancelScheduled/error');
          }
        },

        cancelAllScheduled: async () => {
          try {
            const count = await invoke<number>('notification_cancel_all');
            set({ scheduled: [] }, undefined, 'notification/cancelAllScheduled');
            return count;
          } catch (err) {
            console.error('[NotificationStore] cancelAllScheduled failed:', err);
            set({ error: String(err) }, undefined, 'notification/cancelAllScheduled/error');
            return 0;
          }
        },

        getScheduled: async () => {
          try {
            const scheduled = await invoke<ScheduledNotification[]>('notification_get_scheduled');
            set({ scheduled }, undefined, 'notification/getScheduled');
            return scheduled;
          } catch (err) {
            console.error('[NotificationStore] getScheduled failed:', err);
            return [];
          }
        },

        getScheduledById: async (notificationId) => {
          try {
            return await invoke<ScheduledNotification | null>('notification_get', {
              notificationId,
            });
          } catch (err) {
            console.error('[NotificationStore] getScheduledById failed:', err);
            return null;
          }
        },

        updateScheduled: async (notificationId, title, body, at) => {
          try {
            const updated = await invoke<ScheduledNotification>('notification_update', {
              notificationId,
              title: title ?? null,
              body: body ?? null,
              at: at ?? null,
            });
            set(
              (s) => {
                const idx = s.scheduled.findIndex((n) => n.id === notificationId);
                if (idx >= 0) {
                  s.scheduled[idx] = updated;
                }
              },
              undefined,
              'notification/updateScheduled',
            );
            return updated;
          } catch (err) {
            console.error('[NotificationStore] updateScheduled failed:', err);
            throw err;
          }
        },

        registerActions: async (actions) => {
          try {
            await invoke('notification_register_actions', { actions });
          } catch (err) {
            console.error('[NotificationStore] registerActions failed:', err);
          }
        },

        // =================================================================
        // Per-conversation unread tracking (purely client-side)
        // =================================================================

        incrementUnread: (conversationId) => {
          set(
            (s) => {
              s.unreadCounts[conversationId] = (s.unreadCounts[conversationId] ?? 0) + 1;
            },
            undefined,
            'notification/incrementUnread',
          );
        },

        markConversationRead: (conversationId) => {
          set(
            (s) => {
              delete s.unreadCounts[conversationId];
            },
            undefined,
            'notification/markConversationRead',
          );
        },

        clearAllUnread: () => {
          set({ unreadCounts: {} }, undefined, 'notification/clearAllUnread');
        },

        // =================================================================
        // Notification Center
        // =================================================================

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

        getSettings: async () => {
          try {
            const settings = await invoke<NotificationSettings>('notification_get_settings');
            set({ settings }, undefined, 'notification/getSettings');
            return settings;
          } catch (err) {
            console.error('[NotificationStore] getSettings failed:', err);
            throw err;
          }
        },

        setSettings: async (settings) => {
          try {
            await invoke('notification_set_settings', { settings });
            set({ settings }, undefined, 'notification/setSettings');
          } catch (err) {
            console.error('[NotificationStore] setSettings failed:', err);
            set({ error: String(err) }, undefined, 'notification/setSettings/error');
          }
        },

        create: async (input) => {
          try {
            const notification = await invoke<Notification>('notification_create', { input });
            set(
              (s) => {
                s.notifications.unshift(notification);
                s.total += 1;
                if (!notification.read) {
                  s.unreadCount += 1;
                }
              },
              undefined,
              'notification/create',
            );
            return notification;
          } catch (err) {
            console.error('[NotificationStore] create failed:', err);
            throw err;
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

        // =================================================================
        // Lifecycle
        // =================================================================

        init: async () => {
          const unlisteners: UnlistenFn[] = [];

          // Listen for unread count changes from backend
          const unreadUn = await listen<number>('notification:unread_count', (event) => {
            set({ unreadCount: event.payload }, undefined, 'notification/event/unreadCount');
          });
          unlisteners.push(unreadUn);

          // Listen for new notifications from backend
          const newUn = await listen<Notification>('notification:new', (event) => {
            set(
              (s) => {
                s.notifications.unshift(event.payload);
                s.total += 1;
              },
              undefined,
              'notification/event/new',
            );
          });
          unlisteners.push(newUn);

          // Listen for deleted notifications
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

          // Fetch initial state
          await get().checkPermission();
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

// =============================================================================
// Selectors
// =============================================================================

export const selectPermissionGranted = (s: NotificationState) => s.permissionGranted;
export const selectNotifications = (s: NotificationState) => s.notifications;
export const selectUnreadCount = (s: NotificationState) => s.unreadCount;
export const selectNotificationTotal = (s: NotificationState) => s.total;
export const selectHasMore = (s: NotificationState) => s.hasMore;
export const selectNotificationSettings = (s: NotificationState) => s.settings;
export const selectScheduledNotifications = (s: NotificationState) => s.scheduled;
export const selectNotificationLoading = (s: NotificationState) => s.loading;
export const selectNotificationError = (s: NotificationState) => s.error;

// Per-conversation unread selectors
export const selectUnreadCounts = (s: NotificationState) => s.unreadCounts;

/**
 * Returns the unread count for a specific conversation.
 * Use as: useNotificationStore(selectConversationUnreadCount(conversationId))
 */
export const selectConversationUnreadCount =
  (conversationId: string) =>
  (s: NotificationState): number =>
    s.unreadCounts[conversationId] ?? 0;

/**
 * Returns the sum of all per-conversation unread counts.
 * Useful for a global badge on the chat nav icon.
 */
export const selectTotalConversationUnread = (s: NotificationState): number =>
  Object.values(s.unreadCounts).reduce((acc, n) => acc + n, 0);
