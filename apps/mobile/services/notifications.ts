import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';

// --- Notification event types ---

export type NotificationEventType =
  | 'task_completed'
  | 'agent_approval_needed'
  | 'schedule_triggered'
  | 'companion_connected'
  | 'chat_message';

export interface NotificationData {
  type: NotificationEventType;
  /** Route to navigate to when tapped */
  route?: string;
  /** Arbitrary payload from backend */
  [key: string]: unknown;
}

// --- Foreground notification handler ---

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }) as Notifications.NotificationBehavior,
});

// --- Permission + token registration ---

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
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#21808d',
    });

    await Notifications.setNotificationChannelAsync('agent-approvals', {
      name: 'Agent Approvals',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#ff6b6b',
    });

    await Notifications.setNotificationChannelAsync('tasks', {
      name: 'Tasks & Schedules',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#21808d',
    });
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
    await api.post('/api/mobile/push-token', {
      token,
      platform: Platform.OS,
    });
  } catch {
    // Non-critical — token will be re-sent on next app launch
  }
}

// --- App-ready guard for navigation ---

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
  const attemptPush = () => {
    try {
      router.push(route);
    } catch (err) {
      console.warn('[notifications] Navigation failed:', err);
    }
  };

  if (_navigatorReady) {
    attemptPush();
  } else {
    // Defer until after the current JS turn so the navigator can finish mounting
    setTimeout(attemptPush, 100);
  }
}

// --- Notification response handler (user tapped a notification) ---

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData | undefined;
  if (!data) return;

  switch (data.type) {
    case 'agent_approval_needed':
      // Navigate to companion/desktop view for approval
      safeNavigate('/(app)/companion');
      break;

    case 'task_completed':
      // Navigate to the relevant chat if a route is provided
      if (data.route && typeof data.route === 'string') {
        safeNavigate(data.route as '/(app)');
      } else {
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
        safeNavigate(data.route as '/(app)');
      }
      break;

    default:
      // Unknown type — open app home
      safeNavigate('/(app)');
      break;
  }
}

// --- Listener subscriptions ---

let foregroundSubscription: Notifications.Subscription | null = null;
let responseSubscription: Notifications.Subscription | null = null;
let tokenSubscription: Notifications.Subscription | null = null;

/**
 * Set up all notification listeners. Call once on app mount.
 * Returns a cleanup function to remove all listeners.
 */
export function setupNotificationListeners(): () => void {
  // Foreground notification received (for in-app handling like badge updates)
  foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
    // Update app badge count when a notification arrives while app is in foreground
    const data = notification.request.content.data as NotificationData | undefined;
    if (data?.type === 'agent_approval_needed') {
      Notifications.setBadgeCountAsync(1).catch(() => {});
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
