/**
 * useNotifications Hook
 *
 * Provides a React hook for interacting with the in-app notification center.
 * Supports listing, reading, deleting notifications and managing settings.
 *
 * Features:
 * - Paginated notification list
 * - Mark read/unread
 * - Delete notifications
 * - Settings management
 * - Real-time updates via Tauri events
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ============================================================================
// Types
// ============================================================================

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
  created_at: string;
  read_at: string | null;
  action_url: string | null;
  action_label: string | null;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  dismissible: boolean;
  expires_at: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  sound_enabled: boolean;
  badge_enabled: boolean;
  desktop_notifications: boolean;
  enabled_types: NotificationType[];
  do_not_disturb: boolean;
  dnd_start_time: string | null;
  dnd_end_time: string | null;
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  action_url?: string;
  action_label?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  dismissible?: boolean;
  expires_at?: string;
}

interface UseNotificationsOptions {
  /** Auto-fetch notifications on mount */
  autoFetch?: boolean;
  /** Page size for pagination */
  pageSize?: number;
  /** Filter by unread only */
  unreadOnly?: boolean;
  /** Filter by notification type */
  filterType?: NotificationType;
}

interface UseNotificationsReturn {
  // State
  notifications: Notification[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  settings: NotificationSettings | null;

  // Actions
  list: (options?: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
    type?: NotificationType;
  }) => Promise<NotificationListResponse>;
  markRead: (notificationId: string) => Promise<boolean>;
  markAllRead: () => Promise<number>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  deleteAllRead: () => Promise<number>;
  getSettings: () => Promise<NotificationSettings>;
  setSettings: (settings: NotificationSettings) => Promise<void>;
  create: (input: CreateNotificationInput) => Promise<Notification>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  clearError: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const { autoFetch = true, pageSize = 20, unreadOnly = false, filterType } = options;

  // State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [currentPageSize] = useState(pageSize);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<NotificationSettings | null>(null);

  // Refs
  const mountedRef = useRef(true);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  // ============================================================================
  // API Methods
  // ============================================================================

  const list = useCallback(
    async (
      listOptions: {
        page?: number;
        pageSize?: number;
        unreadOnly?: boolean;
        type?: NotificationType;
      } = {},
    ): Promise<NotificationListResponse> => {
      const requestPage = listOptions.page ?? 1;
      const requestPageSize = listOptions.pageSize ?? currentPageSize;
      const requestUnreadOnly = listOptions.unreadOnly ?? unreadOnly;
      const requestType = listOptions.type ?? filterType;

      setIsLoading(true);
      setError(null);

      try {
        const response = await invoke<NotificationListResponse>('notification_list', {
          page: requestPage,
          pageSize: requestPageSize,
          unreadOnly: requestUnreadOnly,
          notificationType: requestType,
        });

        if (mountedRef.current) {
          if (requestPage === 1) {
            setNotifications(response.notifications);
          } else {
            // Append for pagination
            setNotifications((prev) => [...prev, ...response.notifications]);
          }
          setUnreadCount(response.unread_count);
          setTotal(response.total);
          setPage(response.page);
          setHasMore(response.has_more);
        }

        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setError(errorMessage);
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [currentPageSize, unreadOnly, filterType],
  );

  const markRead = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      const result = await invoke<boolean>('notification_mark_read', { notificationId });

      if (result && mountedRef.current) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const markAllRead = useCallback(async (): Promise<number> => {
    try {
      const count = await invoke<number>('notification_mark_all_read');

      if (mountedRef.current) {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            read: true,
            read_at: n.read_at ?? new Date().toISOString(),
          })),
        );
        setUnreadCount(0);
      }

      return count;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    try {
      const result = await invoke<boolean>('notification_delete', { notificationId });

      if (result && mountedRef.current) {
        setNotifications((prev) => {
          const notification = prev.find((n) => n.id === notificationId);
          if (notification && !notification.read) {
            setUnreadCount((count) => Math.max(0, count - 1));
          }
          return prev.filter((n) => n.id !== notificationId);
        });
        setTotal((prev) => Math.max(0, prev - 1));
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const deleteAllRead = useCallback(async (): Promise<number> => {
    try {
      const count = await invoke<number>('notification_delete_all_read');

      if (mountedRef.current) {
        setNotifications((prev) => prev.filter((n) => !n.read));
        setTotal((prev) => Math.max(0, prev - count));
      }

      return count;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const getSettings = useCallback(async (): Promise<NotificationSettings> => {
    try {
      const result = await invoke<NotificationSettings>('notification_get_settings');

      if (mountedRef.current) {
        setSettingsState(result);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const setSettings = useCallback(async (newSettings: NotificationSettings): Promise<void> => {
    try {
      await invoke('notification_set_settings', { settings: newSettings });

      if (mountedRef.current) {
        setSettingsState(newSettings);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const create = useCallback(async (input: CreateNotificationInput): Promise<Notification> => {
    try {
      const notification = await invoke<Notification>('notification_create', { input });
      return notification;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setError(errorMessage);
      }
      throw err;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await list({ page: 1 });
  }, [list]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (hasMore && !isLoading) {
      await list({ page: page + 1 });
    }
  }, [hasMore, isLoading, page, list]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ============================================================================
  // Event Listeners
  // ============================================================================

  useEffect(() => {
    mountedRef.current = true;

    const setupListeners = async () => {
      try {
        // Listen for new notifications
        const unlistenNew = await listen<Notification>('notification:new', (event) => {
          if (mountedRef.current) {
            setNotifications((prev) => [event.payload, ...prev]);
            setUnreadCount((prev) => prev + 1);
            setTotal((prev) => prev + 1);
          }
        });
        unlistenRefs.current.push(unlistenNew);

        // Listen for unread count updates
        const unlistenUnread = await listen<number>('notification:unread_count', (event) => {
          if (mountedRef.current) {
            setUnreadCount(event.payload);
          }
        });
        unlistenRefs.current.push(unlistenUnread);

        // Listen for deleted notifications
        const unlistenDeleted = await listen<string>('notification:deleted', (event) => {
          if (mountedRef.current) {
            setNotifications((prev) => prev.filter((n) => n.id !== event.payload));
          }
        });
        unlistenRefs.current.push(unlistenDeleted);

        // Listen for settings changes
        const unlistenSettings = await listen<NotificationSettings>(
          'notification:settings_changed',
          (event) => {
            if (mountedRef.current) {
              setSettingsState(event.payload);
            }
          },
        );
        unlistenRefs.current.push(unlistenSettings);
      } catch (err) {
        console.error('[useNotifications] Failed to setup event listeners:', err);
      }
    };

    void setupListeners();

    return () => {
      mountedRef.current = false;
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];
    };
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      void list({ page: 1 });
      void getSettings();
    }
  }, [autoFetch, list, getSettings]);

  return {
    // State
    notifications,
    unreadCount,
    total,
    page,
    pageSize: currentPageSize,
    hasMore,
    isLoading,
    error,
    settings,

    // Actions
    list,
    markRead,
    markAllRead,
    deleteNotification,
    deleteAllRead,
    getSettings,
    setSettings,
    create,
    refresh,
    loadMore,
    clearError,
  };
}

export default useNotifications;
