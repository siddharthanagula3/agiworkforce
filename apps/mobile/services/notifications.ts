import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';
import { getDeviceId } from '@/lib/deviceId';

// --- Notification event types ---

export type NotificationEventType =
  | 'task_completed'
  | 'agent_approval_needed'
  | 'agent_failed'
  | 'emergency_stop_triggered'
  | 'approval_pending_escalation'
  | 'agent_paused'
  | 'status_update'
  | 'heartbeat_info'
  | 'schedule_triggered'
  | 'companion_connected'
  | 'chat_message';

/**
 * Priority tier controls notification urgency.
 *
 * - critical : agent failed / emergency stop — persistent notification + vibrate
 * - high     : approval pending >2min        — sound + banner
 * - normal   : task completed / paused       — silent banner
 * - low      : status updates / heartbeat    — badge only
 */
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface NotificationData {
  type: NotificationEventType;
  priority?: NotificationPriority;
  /** Route to navigate to when tapped */
  route?: string;
  /** Agent ID this notification is about */
  agentId?: string;
  /** Arbitrary payload from backend */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Android notification channels — one per priority tier
// ---------------------------------------------------------------------------

const ANDROID_CHANNELS: Record<
  string,
  {
    id: string;
    name: string;
    importance: number;
    vibrationPattern?: number[];
    lightColor: string;
    bypassDnd?: boolean;
    sound?: string;
  }
> = {
  critical: {
    id: 'critical',
    name: 'Critical Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#ef4444',
    bypassDnd: true,
    sound: 'default',
  },
  high: {
    id: 'high',
    name: 'High Priority',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#f59e0b',
    sound: 'default',
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#21808d',
  },
  low: {
    id: 'low',
    name: 'Status Updates',
    importance: Notifications.AndroidImportance.MIN,
    lightColor: '#21808d',
  },
};

// ---------------------------------------------------------------------------
// Notification handler (foreground behavior per priority)
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as NotificationData | undefined;
    const priority = data?.priority ?? inferPriority(data?.type);

    switch (priority) {
      case 'critical':
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        } as Notifications.NotificationBehavior;
      case 'high':
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        } as Notifications.NotificationBehavior;
      case 'normal':
        return {
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        } as Notifications.NotificationBehavior;
      case 'low':
        // Badge only — no alert, no sound
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
        } as Notifications.NotificationBehavior;
    }
  },
});

// ---------------------------------------------------------------------------
// Permission + token registration
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    // Register all four priority channels
    for (const channel of Object.values(ANDROID_CHANNELS)) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: channel.importance,
        vibrationPattern: 'vibrationPattern' in channel ? channel.vibrationPattern : undefined,
        lightColor: channel.lightColor,
        sound: 'sound' in channel ? (channel.sound as string) : undefined,
        bypassDnd: 'bypassDnd' in channel ? (channel.bypassDnd as boolean) : undefined,
      });
    }
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const pushToken = tokenData.data;

  await sendTokenToBackend(pushToken);

  return pushToken;
}

// --- Token backend sync ---

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await api.post('/api/mobile/push-token', {
      deviceId,
      pushToken: token,
    });
  } catch {
    // Non-critical — token will be re-sent on next app launch
  }
}

// ---------------------------------------------------------------------------
// Local notification dispatch (in-app trigger)
// ---------------------------------------------------------------------------

/**
 * Schedule a local notification with the appropriate priority tier.
 * Use this for events the mobile app detects directly (e.g., approval escalation).
 */
export async function scheduleLocalNotification(opts: {
  title: string;
  body: string;
  type: NotificationEventType;
  priority?: NotificationPriority;
  agentId?: string;
  route?: string;
}): Promise<void> {
  const priority = opts.priority ?? inferPriority(opts.type);

  const data: NotificationData = {
    type: opts.type,
    priority,
    agentId: opts.agentId,
    route: opts.route,
  };

  const content: Notifications.NotificationContentInput = {
    title: opts.title,
    body: opts.body,
    data: data as unknown as Record<string, unknown>,
    sound: priority === 'critical' || priority === 'high' ? 'default' : undefined,
    badge: 1,
  };

  // Android: route to the correct channel
  if (Platform.OS === 'android') {
    (content as Record<string, unknown>).channelId = priority;
  }

  // Critical tier on iOS: mark as time-sensitive
  if (Platform.OS === 'ios' && priority === 'critical') {
    (content as Record<string, unknown>).interruptionLevel = 'timeSensitive';
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null, // immediate
  });
}

// ---------------------------------------------------------------------------
// Input validation — sanitize notification data before use in navigation
// ---------------------------------------------------------------------------

/** Matches a standard UUID (v4 or any version with hex chars). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate that a value is a well-formed UUID safe for use in navigation paths. */
function isValidAgentId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Route allowlist — only navigate to known safe app routes
// ---------------------------------------------------------------------------

const ALLOWED_ROUTE_PREFIXES = [
  '/(app)/companion',
  '/(app)/(tabs)/chat',
  '/(app)/settings',
  '/(app)/notifications',
  '/(app)/schedules',
  '/(app)/agents',
] as const;

function isAllowedRoute(route: string): boolean {
  return ALLOWED_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// App-ready guard for navigation
// ---------------------------------------------------------------------------

/**
 * Whether the app navigator is ready to accept push calls.
 * Must be set to true by the root layout after the navigator mounts.
 * Prevents "navigate before navigator is ready" crashes on cold-start
 * notification taps.
 */
let _navigatorReady = false;

export function setNavigatorReady(ready: boolean): void {
  _navigatorReady = ready;
}

/**
 * Safe wrapper around router.push.
 * If the navigator is not yet ready, queues the navigation to run on the
 * next tick (giving the layout time to mount). If it still fails, the
 * error is caught and logged rather than crashing the app.
 */
function safeNavigate(route: Parameters<typeof router.push>[0]): void {
  let attempts = 0;
  const maxAttempts = 4;

  const attemptPush = () => {
    attempts++;
    try {
      router.push(route);
    } catch (err) {
      if (attempts < maxAttempts && !_navigatorReady) {
        // Exponential backoff: 100ms, 200ms, 400ms
        setTimeout(attemptPush, 100 * Math.pow(2, attempts - 1));
      } else {
        console.warn('[notifications] Navigation failed after retries:', err);
      }
    }
  };

  if (_navigatorReady) {
    attemptPush();
  } else {
    // Defer until after the current JS turn so the navigator can finish mounting
    setTimeout(attemptPush, 50);
  }
}

// ---------------------------------------------------------------------------
// Notification response handler (user tapped a notification)
// ---------------------------------------------------------------------------

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData | undefined;
  if (!data) return;

  // Store the notification in the in-app notification center
  notificationCenterStore.add(response.notification);

  switch (data.type) {
    case 'agent_failed':
    case 'emergency_stop_triggered':
      // Critical: deep link to agent detail or companion dashboard
      if (isValidAgentId(data.agentId)) {
        safeNavigate(`/(app)/companion/agent/${data.agentId}` as Parameters<typeof router.push>[0]);
      } else {
        if (data.agentId) {
          console.warn('[notifications] Blocked navigation with invalid agentId:', data.agentId);
        }
        safeNavigate('/(app)/companion');
      }
      break;

    case 'agent_approval_needed':
    case 'approval_pending_escalation':
      // Navigate to companion/desktop view for approval
      safeNavigate('/(app)/companion');
      break;

    case 'agent_paused':
      // Navigate to agent detail if we have a valid agentId
      if (isValidAgentId(data.agentId)) {
        safeNavigate(`/(app)/companion/agent/${data.agentId}` as Parameters<typeof router.push>[0]);
      } else {
        if (data.agentId) {
          console.warn('[notifications] Blocked navigation with invalid agentId:', data.agentId);
        }
        safeNavigate('/(app)/companion');
      }
      break;

    case 'task_completed':
      // Navigate to the relevant chat if a validated route is provided
      if (data.route && typeof data.route === 'string' && isAllowedRoute(data.route)) {
        safeNavigate(data.route as '/(app)');
      } else {
        if (data.route && !isAllowedRoute(data.route as string)) {
          console.warn('[notifications] Blocked navigation to disallowed route:', data.route);
        }
        safeNavigate('/(app)');
      }
      break;

    case 'schedule_triggered':
      safeNavigate('/(app)/schedules');
      break;

    case 'companion_connected':
      safeNavigate('/(app)/companion');
      break;

    case 'chat_message':
      if (data.route && typeof data.route === 'string') {
        if (isAllowedRoute(data.route)) {
          safeNavigate(data.route as '/(app)');
        } else {
          console.warn('[notifications] Blocked navigation to disallowed route:', data.route);
          safeNavigate('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
        }
      }
      break;

    case 'status_update':
    case 'heartbeat_info':
      // Low priority — navigate to notification center
      safeNavigate('/(app)/notifications' as Parameters<typeof router.push>[0]);
      break;

    default:
      // Unknown type — open app home
      safeNavigate('/(app)');
      break;
  }
}

// ---------------------------------------------------------------------------
// In-app Notification Center store
// ---------------------------------------------------------------------------

export interface NotificationCenterItem {
  id: string;
  title: string;
  body: string;
  data: NotificationData;
  priority: NotificationPriority;
  receivedAt: string;
  read: boolean;
}

type NotificationCenterListener = (items: NotificationCenterItem[]) => void;

/** Lightweight in-memory notification center (not persisted — use MMKV if persistence needed) */
const notificationCenterStore = (() => {
  let items: NotificationCenterItem[] = [];
  const listeners = new Set<NotificationCenterListener>();

  function notify(): void {
    for (const listener of listeners) {
      listener([...items]);
    }
  }

  return {
    getAll: (): NotificationCenterItem[] => [...items],

    add: (notification: Notifications.Notification): void => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as NotificationData;
      const priority = data.priority ?? inferPriority(data.type);

      const item: NotificationCenterItem = {
        id: notification.request.identifier,
        title: content.title ?? '',
        body: content.body ?? '',
        data,
        priority,
        receivedAt: new Date().toISOString(),
        read: false,
      };

      // Prepend newest first, cap at 50 items
      items = [item, ...items].slice(0, 50);
      notify();
    },

    markRead: (id: string): void => {
      items = items.map((item) => (item.id === id ? { ...item, read: true } : item));
      notify();
    },

    markAllRead: (): void => {
      items = items.map((item) => ({ ...item, read: true }));
      notify();
    },

    clear: (): void => {
      items = [];
      notify();
    },

    subscribe: (listener: NotificationCenterListener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getUnreadCount: (): number => items.filter((i) => !i.read).length,
  };
})();

export { notificationCenterStore };

// ---------------------------------------------------------------------------
// React hook for notification center
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

export function useNotificationCenter(): {
  items: NotificationCenterItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
} {
  const [items, setItems] = useState<NotificationCenterItem[]>(notificationCenterStore.getAll());

  useEffect(() => {
    const unsub = notificationCenterStore.subscribe(setItems);
    return unsub;
  }, []);

  return {
    items,
    unreadCount: items.filter((i) => !i.read).length,
    markRead: notificationCenterStore.markRead,
    markAllRead: notificationCenterStore.markAllRead,
    clear: notificationCenterStore.clear,
  };
}

// ---------------------------------------------------------------------------
// Listener subscriptions
// ---------------------------------------------------------------------------

let foregroundSubscription: Notifications.Subscription | null = null;
let responseSubscription: Notifications.Subscription | null = null;
let tokenSubscription: Notifications.Subscription | null = null;

/**
 * Set up all notification listeners. Call once on app mount.
 * Returns a cleanup function to remove all listeners.
 */
export function setupNotificationListeners(): () => void {
  // Guard: if listeners already exist, return existing cleanup to prevent duplicates.
  if (foregroundSubscription || responseSubscription || tokenSubscription) {
    return () => {
      foregroundSubscription?.remove();
      responseSubscription?.remove();
      tokenSubscription?.remove();
      foregroundSubscription = null;
      responseSubscription = null;
      tokenSubscription = null;
    };
  }

  // Foreground notification received (for in-app handling like badge updates)
  foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as NotificationData | undefined;

    // Store in notification center
    notificationCenterStore.add(notification);

    // Update badge for high-priority notifications
    if (
      data?.type === 'agent_approval_needed' ||
      data?.type === 'agent_failed' ||
      data?.type === 'emergency_stop_triggered' ||
      data?.type === 'approval_pending_escalation'
    ) {
      Notifications.setBadgeCountAsync(notificationCenterStore.getUnreadCount()).catch((err) => {
        console.warn('[Notifications] Failed to update badge count:', err);
      });
    }
  });

  // User tapped a notification (foreground or background)
  responseSubscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  );

  // Push token refreshed (re-register with backend)
  tokenSubscription = Notifications.addPushTokenListener((newToken) => {
    sendTokenToBackend(newToken.data);
  });

  return () => {
    foregroundSubscription?.remove();
    responseSubscription?.remove();
    tokenSubscription?.remove();
    foregroundSubscription = null;
    responseSubscription = null;
    tokenSubscription = null;
  };
}

/**
 * Handle the notification that launched the app (cold start).
 * Must be called after listeners are set up.
 */
export async function handleInitialNotification(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    handleNotificationResponse(response);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer notification priority from event type.
 */
function inferPriority(type: NotificationEventType | undefined): NotificationPriority {
  switch (type) {
    case 'agent_failed':
    case 'emergency_stop_triggered':
      return 'critical';
    case 'agent_approval_needed':
    case 'approval_pending_escalation':
      return 'high';
    case 'task_completed':
    case 'agent_paused':
    case 'schedule_triggered':
    case 'companion_connected':
    case 'chat_message':
      return 'normal';
    case 'status_update':
    case 'heartbeat_info':
      return 'low';
    default:
      return 'normal';
  }
}

/**
 * Get display color for a priority tier.
 */
export function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return '#ef4444';
    case 'high':
      return '#f59e0b';
    case 'normal':
      return '#21808d';
    case 'low':
      return '#6b7280';
  }
}

/**
 * Get display label for a priority tier.
 */
export function getPriorityLabel(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'normal':
      return 'Normal';
    case 'low':
      return 'Low';
  }
}
