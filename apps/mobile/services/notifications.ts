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

// LOW-MOB-3 fix (red-team 2026-05): the notification handler used to
// `safeNavigate` to `/(app)/*` regardless of auth state — a notification
// that fires before the auth gate has resolved would race the redirect-
// to-login effect in `_layout.tsx` and the user could land in the
// authenticated portion of the app for ~one frame, including reading
// loading-state bound to a yet-unauthenticated context. We now require
// the layout to push the current session into this module before any
// notification can navigate. Notifications that fire while no session is
// known route to /(auth)/login.
// The real v1 sign-in signal is a boolean bridged from Clerk (isClerkSignedIn);
// the legacy `useAuthStore.session` is always null in v1, so gating navigation on
// a session object permanently routes every notification tap to /(auth)/login
// (#386 migration miss). We track a boolean instead.
let _isSignedIn = false;
/** Preferred: feed the real Clerk sign-in boolean from _layout.tsx. */
export function setSignedIn(value: boolean): void {
  _isSignedIn = value;
}
/**
 * Back-compat shim: a non-null session means signed-in. Retained so existing
 * call sites/tests that pass a session object keep working.
 */
export function setCurrentSession(session: MobileAuthSession | null): void {
  _isSignedIn = session != null;
}

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

    // Honor the user's Notification Preferences (category toggles + quiet hours)
    // for foreground presentation too — these settings were previously inert
    // because no live notification path consulted them. Lazy require (not a top
    // import) keeps this early, widely-imported module from pulling the store's
    // secure-storage chain into every consumer's module graph; fail OPEN so a
    // store load error never silently drops a notification.
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
    // Remote-push registration is a non-fatal CAPABILITY: it legitimately fails on
    // the iOS Simulator (no "aps-environment" entitlement), on dev builds without a
    // push capability, when APNs is unreachable, or when the backend token sync
    // fails. Degrade to "no push token" instead of letting the promise reject —
    // an uncaught rejection here surfaces as a red error overlay in dev and is a
    // silent crash risk in prod. Push simply stays off for this session.
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      // A missing "aps-environment" entitlement is the expected, unavoidable
      // outcome on the Simulator and on dev builds using the minimal
      // entitlement set — not a defect worth a warning on every launch. Keep
      // warn for everything else (APNs unreachable, backend token sync failed),
      // where the diagnostic is the whole point.
      if (message.includes('aps-environment')) {
        console.debug('[push] not available in this build (no aps-environment entitlement)');
      } else {
        console.warn('[push] registration skipped (non-fatal):', message);
      }
    }
    return null;
  }
}

// --- Token backend sync ---

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
    // Non-critical — token will be re-sent on next app launch
    return false;
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
// Route allowlist — only navigate to known safe app routes
// ---------------------------------------------------------------------------

// Each prefix may carry a feature gate: a push can only navigate to it when the
// underlying feature is enabled in this build. Without the gate, a stray push
// for a disabled feature would
// route the user to a screen that is gated off. Always-available prefixes use
// `null`. (Defence-in-depth: those screens now render <FeatureUnavailable/>
// rather than a blank, but we still avoid navigating to them.)
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

  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
    response.actionIdentifier !== AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER
  ) {
    console.warn('[notifications] Ignored unknown notification action:', response.actionIdentifier);
    return;
  }

  // Store the notification in the in-app notification center
  notificationCenterStore.add(response.notification);

  if (!_isSignedIn) {
    // No active session — defer to login screen. We do not pass arbitrary
    // notification data through to the login screen as a redirect target;
    // the user will land on the default post-login route.
    safeNavigate({ pathname: '/(auth)/login' as const });
    return;
  }

  switch (data.type) {
    case 'agent_failed':
    case 'emergency_stop_triggered':
    case 'agent_paused':
      // Deep link to the live Cloud tasks/runs list. The legacy companion
      // agent-detail screen (/(app)/companion/agent/[id]) and /(app)/agents/[id]
      // are both gated behind FEATURES.agents (false in v1) and render
      // <FeatureUnavailable/>, so a real notification tap there was a dead end
      // (MOBILE-AGENT-NOTIF-DEADEND-01). /(app)/agents (TasksScreen) is gated by
      // FEATURES.cloudTasks (true) and is the live runs list. The push agentId is
      // a companion id, not a cloud run id, so we route to the list rather than a
      // mismatched detail route.
      safeNavigate({ pathname: '/(app)/agents' as const });
      break;

    case 'agent_approval_needed':
    case 'approval_pending_escalation':
      // Navigate to companion/desktop view for approval (FEATURES.companion is live)
      safeNavigate({ pathname: '/(app)/companion' as const });
      break;

    case 'task_completed':
      // Navigate to the relevant chat if a validated route is provided
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
        // No route provided — fall back to the chat tab. Every other type has a
        // default destination; a routeless chat_message tap must not be a dead tap.
        safeNavigate({ pathname: '/(app)/(tabs)/chat' as const });
      }
      break;

    case 'status_update':
    case 'heartbeat_info':
      // Low priority — navigate to notification center
      safeNavigate({ pathname: '/(app)/notifications' as const });
      break;

    default:
      // Unknown type — open app home
      safeNavigate({ pathname: '/(app)' as const });
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
export function setupNotificationListeners(
  accountContext: PushNotificationAccountContext | null,
): () => void {
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
