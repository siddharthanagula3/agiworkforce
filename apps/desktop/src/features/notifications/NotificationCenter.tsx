/**
 * NotificationCenter Component
 *
 * A comprehensive in-app notification center that displays notifications
 * with support for reading, deleting, and managing notification settings.
 */
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Info,
  RefreshCw,
  Settings,
  Trash2,
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Users,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  useNotificationStore,
  selectNotifications,
  selectUnreadCount,
  selectNotificationLoading,
  selectNotificationError,
  selectHasMore,
} from '@/stores/notificationStore';
import type {
  Notification,
  NotificationType,
  NotificationPriority,
} from '@/stores/notificationStore';
import { useSettingsDialogStore } from '@/stores/settingsDialogStore';
import type { SettingsTab } from '@/stores/settingsDialogStore';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

// ============================================================================
// Types
// ============================================================================

type FilterType = 'all' | 'unread';

interface NotificationCenterProps {
  /** Additional CSS classes */
  className?: string;
  /** Callback when clicking on a notification action */
  onActionClick?: (notification: Notification) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'system':
      return <Settings className="h-4 w-4" />;
    case 'task_complete':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'task_failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'agent_activity':
      return <Zap className="h-4 w-4 text-purple-500" />;
    case 'mcp_server':
      return <Settings className="h-4 w-4 text-blue-500" />;
    case 'reminder':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'achievement':
      return <Trophy className="h-4 w-4 text-amber-500" />;
    case 'team':
      return <Users className="h-4 w-4 text-indigo-500" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function getPriorityConfig(priority: NotificationPriority) {
  switch (priority) {
    case 'urgent':
      return {
        label: 'Critical',
        dotColor: 'bg-red-500',
        badgeClass: 'bg-red-500/15 text-red-500 border-red-500/30',
        ringClass: 'ring-1 ring-red-500/20',
      };
    case 'high':
      return {
        label: 'High',
        dotColor: 'bg-orange-500',
        badgeClass: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
        ringClass: 'ring-1 ring-orange-500/10',
      };
    case 'normal':
      return {
        label: 'Normal',
        dotColor: 'bg-blue-500',
        badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        ringClass: '',
      };
    case 'low':
    default:
      return {
        label: 'Low',
        dotColor: 'bg-muted-foreground/40',
        badgeClass: 'bg-muted text-muted-foreground border-border',
        ringClass: '',
      };
  }
}

// ============================================================================
// Sub-components
// ============================================================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onActionClick?: (notification: Notification) => void;
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onActionClick,
}: NotificationItemProps) {
  const handleClick = useCallback(() => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    if (notification.actionUrl && onActionClick) {
      onActionClick(notification);
    }
  }, [notification, onMarkRead, onActionClick]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(notification.id);
    },
    [notification.id, onDelete],
  );

  const handleMarkRead = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMarkRead(notification.id);
    },
    [notification.id, onMarkRead],
  );

  const priorityConf = getPriorityConfig(notification.priority);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer',
        'hover:bg-accent/50',
        !notification.read && 'bg-accent/30',
        priorityConf.ringClass,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Priority dot + Icon */}
      <div className="relative shrink-0">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', 'bg-muted')}>
          {getNotificationIcon(notification.type)}
        </div>
        {/* Priority indicator dot */}
        {(notification.priority === 'urgent' || notification.priority === 'high') && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
              priorityConf.dotColor,
            )}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p
                className={cn(
                  'text-sm font-medium truncate',
                  !notification.read && 'text-foreground',
                  notification.read && 'text-muted-foreground',
                )}
              >
                {notification.title}
              </p>
              {(notification.priority === 'urgent' || notification.priority === 'high') && (
                <span
                  className={cn(
                    'shrink-0 rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wider',
                    priorityConf.badgeClass,
                  )}
                >
                  {priorityConf.label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {notification.message}
            </p>
          </div>

          {/* Unread indicator */}
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>

          <div className="flex items-center gap-1">
            {notification.actionUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClick}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{notification.actionLabel ?? 'Go to context'}</TooltipContent>
              </Tooltip>
            )}
            {!notification.read && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleMarkRead}>
                    <Check className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark as read</TooltipContent>
              </Tooltip>
            )}
            {notification.dismissible && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={handleDelete}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dismiss</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationCenter({ className, onActionClick }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Default navigation handler: parse actionUrl like "task:abc-123", "approval:xyz", etc.
  // and open the settings dialog at the relevant tab or emit a navigation event.
  const handleNavigate = useCallback(
    (notification: Notification) => {
      if (onActionClick) {
        onActionClick(notification);
        return;
      }

      const url = notification.actionUrl;
      if (!url) return;

      // Simple scheme-based routing
      const [scheme, id] = url.split(':', 2);
      switch (scheme) {
        case 'task':
        case 'approval':
        case 'workflow': {
          // Emit a custom event that the app shell can listen to for routing
          window.dispatchEvent(
            new CustomEvent('notification:navigate', { detail: { scheme, id, notification } }),
          );
          break;
        }
        case 'settings': {
          useSettingsDialogStore.getState().openSettings((id as SettingsTab) || 'general');
          break;
        }
        default:
          // For plain URLs, open externally
          if (url.startsWith('http')) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
      }

      setIsOpen(false);
    },
    [onActionClick],
  );

  const notifications = useNotificationStore(selectNotifications);
  const unreadCount = useNotificationStore(selectUnreadCount);
  const isLoading = useNotificationStore(selectNotificationLoading);
  const error = useNotificationStore(selectNotificationError);
  const hasMore = useNotificationStore(selectHasMore);
  const storeMarkRead = useNotificationStore((s) => s.markRead);
  const storeMarkAllRead = useNotificationStore((s) => s.markAllRead);
  const storeDelete = useNotificationStore((s) => s.deleteNotification);
  const storeDeleteAllRead = useNotificationStore((s) => s.deleteAllRead);
  const storeList = useNotificationStore((s) => s.list);
  const page = useNotificationStore((s) => s.page);

  // Initialize the notification store on mount
  useEffect(() => {
    const store = useNotificationStore.getState();
    void store.init();
    void store.list(1, 20);
    return () => {
      useNotificationStore.getState().cleanup();
    };
  }, []);

  // Filter notifications based on active tab
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [notifications, activeFilter]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await storeMarkRead(id);
      } catch (err) {
        console.error('[NotificationCenter] Failed to mark as read:', err);
      }
    },
    [storeMarkRead],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await storeDelete(id);
      } catch (err) {
        console.error('[NotificationCenter] Failed to delete:', err);
      }
    },
    [storeDelete],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await storeMarkAllRead();
    } catch (err) {
      console.error('[NotificationCenter] Failed to mark all as read:', err);
    }
  }, [storeMarkAllRead]);

  const handleDeleteAllRead = useCallback(async () => {
    try {
      await storeDeleteAllRead();
    } catch (err) {
      console.error('[NotificationCenter] Failed to delete all read:', err);
    }
  }, [storeDeleteAllRead]);

  const handleRefresh = useCallback(async () => {
    try {
      await storeList(1, 20);
    } catch (err) {
      console.error('[NotificationCenter] Failed to refresh:', err);
    }
  }, [storeList]);

  const handleLoadMore = useCallback(async () => {
    try {
      if (hasMore && !isLoading) {
        await storeList(page + 1, 20);
      }
    } catch (err) {
      console.error('[NotificationCenter] Failed to load more:', err);
    }
  }, [storeList, hasMore, isLoading, page]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 relative', className)}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            {unreadCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleMarkAllRead}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark all as read</TooltipContent>
              </Tooltip>
            )}
            {notifications.some((n) => n.read) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={handleDeleteAllRead}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear read notifications</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as FilterType)}
          className="w-full"
        >
          <div className="border-b px-4">
            <TabsList className="h-9 w-full justify-start bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="relative rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="relative rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Unread
                {unreadCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">({unreadCount})</span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Content */}
          <TabsContent value={activeFilter} className="m-0">
            <ScrollArea className="h-[400px]">
              <div className="p-2">
                {/* Error state */}
                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg mx-2 my-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Loading state */}
                {isLoading && notifications.length === 0 && (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-3 p-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {!isLoading && filteredNotifications.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <BellOff className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No notifications</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeFilter === 'unread'
                        ? "You're all caught up!"
                        : 'Notifications will appear here'}
                    </p>
                  </div>
                )}

                {/* Notification list */}
                {filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={handleMarkRead}
                    onDelete={handleDelete}
                    onActionClick={handleNavigate}
                  />
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load more'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationCenter;
