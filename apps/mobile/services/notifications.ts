import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { MobileAuthSession } from './authSession';
import { api } from './api';
import { getDeviceId } from '@/lib/deviceId';
import { FEATURES, type FeatureKey } from '@/lib/v1FeatureFlags';
import { notificationAllowed } from './notificationGate';
import { AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER } from './notificationCategories';

let _isSignedIn = false;
export function setSignedIn(value: boolean): void {
  _isSignedIn = value;
}
export function setCurrentSession(session: MobileAuthSession | null): void {
  _isSignedIn = session != null;
}

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
  // Emitted by the ONLY server-side push producer this app has:
  // `apps/web/lib/services/schedule-notification-service.ts` sends
  // `{ type: 'schedule_run', taskId }` after a scheduled run is finalized.
  // Without this member every real push fell through to `default:` and opened
  // app home instead of the schedules list.
  | 'schedule_run'
  | 'companion_connected'
  | 'chat_message';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface NotificationData {
  type: NotificationEventType;
  priority?: NotificationPriority;
  route?: string;
  agentId?: string;
  [key: string]: unknown;
}

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

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as NotificationData | undefined;

    if (data?.type && !notificationAllowed(data.type)) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      } as Notifications.NotificationBehavior;
    }

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
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
        } as Notifications.NotificationBehavior;
    }
  },
});

export interface PushNotificationAccountContext {
  ownerId: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  getAuthToken: () => Promise<string | null>;
}

function accountContextIsCurrent(accountContext: PushNotificationAccountContext): boolean {
  return !accountContext.signal.aborted && accountContext.isCurrent();
}

export async function registerForPushNotifications(
  accountContext: PushNotificationAccountContext,
): Promise<string | null> {
  try {
    if (!accountContextIsCurrent(accountContext)) return null;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (!accountContextIsCurrent(accountContext)) return null;
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (!accountContextIsCurrent(accountContext)) return null;
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      for (const channel of Object.values(ANDROID_CHANNELS)) {
        await Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          importance: channel.importance,
          vibrationPattern: 'vibrationPattern' in channel ? channel.vibrationPattern : undefined,
          lightColor: channel.lightColor,
          sound: 'sound' in channel ? (channel.sound as string) : undefined,
          bypassDnd: 'bypassDnd' in channel ? (channel.bypassDnd as boolean) : undefined,
        });
        if (!accountContextIsCurrent(accountContext)) return null;
      }
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!accountContextIsCurrent(accountContext)) return null;
    const pushToken = tokenData.data;

    const registered = await sendTokenToBackend(pushToken, accountContext);
    if (!registered || !accountContextIsCurrent(accountContext)) return null;

    return pushToken;
  } catch (err) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('aps-environment')) {
        console.debug('[push] not available in this build (no aps-environment entitlement)');
      } else {
        console.warn('[push] registration skipped (non-fatal):', message);
      }
    }
    return null;
  }
}

async function sendTokenToBackend(
  token: string,
  accountContext: PushNotificationAccountContext,
): Promise<boolean> {
  try {
    if (!accountContextIsCurrent(accountContext)) return false;
    const authToken = await accountContext.getAuthToken();
    if (!authToken || !accountContextIsCurrent(accountContext)) {
      return false;
    }

    const deviceId = await getDeviceId();
    if (!accountContextIsCurrent(accountContext)) return false;
    await api.post(
      '/api/mobile/push-token',
      {
        deviceId,
        pushToken: token,
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: accountContext.signal,
      },
    );
    return accountContextIsCurrent(accountContext);
  } catch {
    return false;
  }
}

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

  if (Platform.OS === 'android') {
    (content as Record<string, unknown>).channelId = priority;
  }

  if (Platform.OS === 'ios' && priority === 'critical') {
    (content as Record<string, unknown>).interruptionLevel = 'timeSensitive';
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null, // immediate
  });
}

const ALLOWED_ROUTE_PREFIXES: ReadonlyArray<{ prefix: string; flag: FeatureKey | null }> = [
  { prefix: '/(app)/companion', flag: 'companion' },
  { prefix: '/(app)/(tabs)/chat', flag: null },
  { prefix: '/(app)/settings', flag: null },
  { prefix: '/(app)/notifications', flag: 'cloudChat' },
  { prefix: '/(app)/schedules', flag: 'schedules' },
  { prefix: '/(app)/agents', flag: 'cloudTasks' },
];

function isAllowedRoute(route: string): boolean {
  return ALLOWED_ROUTE_PREFIXES.some(
    ({ prefix, flag }) => route.startsWith(prefix) && (flag === null || FEATURES[flag]),
  );
}

let _navigatorReady = false;

export function setNavigatorReady(ready: boolean): void {
  _navigatorReady = ready;
}

function safeNavigate(route: Parameters<typeof router.push>[0]): void {
  let attempts = 0;
  const maxAttempts = 4;

  const attemptPush = () => {
    attempts++;
    try {
      router.push(route);
    } catch (err) {
      if (attempts < maxAttempts && !_navigatorReady) {
        setTimeout(attemptPush, 100 * Math.pow(2, attempts - 1));
      } else {
        console.warn('[notifications] Navigation failed after retries:', err);
      }
    }
  };

  if (_navigatorReady) {
    attemptPush();
  } else {
    setTimeout(attemptPush, 50);
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData | undefined;
  if (!data) return;

  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
    response.actionIdentifier !== AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER
  ) {
    console.warn('[notifications] Ignored unknown notification action:', response.actionIdentifier);
    return;
  }

  notificationCenterStore.add(response.notification);

  if (!_isSignedIn) {
    safeNavigate({ pathname: '/(auth)/login' as const });
    return;
  }

  switch (data.type) {
    case 'agent_failed':
    case 'emergency_stop_triggered':
    case 'agent_paused':
      safeNavigate({ pathname: '/(app)/agents' as const });
      break;

    case 'agent_approval_needed':
    case 'approval_pending_escalation':
      safeNavigate({ pathname: '/(app)/companion' as const });
      break;

    case 'task_completed':
      if (data.route && typeof data.route === 'string' && isAllowedRoute(data.route)) {
        safeNavigate(data.route as Parameters<typeof router.push>[0]);
      } else {
        if (data.route && !isAllowedRoute(data.route as string)) {
          console.warn('[notifications] Blocked navigation to disallowed route:', data.route);
        }
        safeNavigate({ pathname: '/(app)' as const });
      }
      break;

    case 'schedule_triggered':
    case 'schedule_run':
      safeNavigate({ pathname: '/(app)/schedules' as const });
      break;

    case 'companion_connected':
      safeNavigate({ pathname: '/(app)/companion' as const });
      break;

    case 'chat_message':
      if (data.route && typeof data.route === 'string') {
        if (isAllowedRoute(data.route)) {
          safeNavigate(data.route as Parameters<typeof router.push>[0]);
        } else {
          console.warn('[notifications] Blocked navigation to disallowed route:', data.route);
          safeNavigate({ pathname: '/(app)/(tabs)/chat' as const });
        }
      } else {
        safeNavigate({ pathname: '/(app)/(tabs)/chat' as const });
      }
      break;

    case 'status_update':
    case 'heartbeat_info':
      safeNavigate({ pathname: '/(app)/notifications' as const });
      break;

    default:
      safeNavigate({ pathname: '/(app)' as const });
      break;
  }
}

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

let foregroundSubscription: Notifications.Subscription | null = null;
let responseSubscription: Notifications.Subscription | null = null;
let tokenSubscription: Notifications.Subscription | null = null;

export function setupNotificationListeners(
  accountContext: PushNotificationAccountContext | null,
): () => void {
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

  foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as NotificationData | undefined;

    notificationCenterStore.add(notification);

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

  responseSubscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  );

  tokenSubscription = Notifications.addPushTokenListener((newToken) => {
    if (accountContext && accountContextIsCurrent(accountContext)) {
      void sendTokenToBackend(newToken.data, accountContext);
    }
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

export async function handleInitialNotification(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    handleNotificationResponse(response);
  }
}

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
