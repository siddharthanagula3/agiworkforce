import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { getDeviceId } from '@/lib/deviceId';
import {
  deviceTimezone,
  getCategoryForType,
  useNotificationPrefsStore,
  type NotificationCategory,
} from '@/stores/notificationPrefsStore';
import type { TimeFocusWeekday } from '@agiworkforce/types';

import { api } from './api';
import {
  NOTIFICATION_EVENT_TYPES,
  QUIET_HOURS_EXEMPT_EVENT_TYPES,
  type NotificationEventType,
} from './notificationEventTypes';
import type { PushNotificationAccountContext } from './notifications';

export const PUSH_TOKEN_REGISTRATION_PATH = '/api/mobile/push-token';
export const PUSH_DELIVERY_PREFERENCES_VERSION = 1;

const PREFERENCE_SYNC_DEBOUNCE_MS = 800;
const ACTIVE_APP_STATE: AppStateStatus = 'active';

export interface PushDeliveryQuietHours {
  enabled: boolean;
  days: TimeFocusWeekday[];
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface PushDeliveryPreferences {
  version: number;
  timezone: string;
  categories: Record<NotificationCategory, boolean>;
  eventTypes: Record<NotificationEventType, boolean>;
  quietHours: PushDeliveryQuietHours;
  quietHoursExemptEventTypes: NotificationEventType[];
}

let activeToken: string | null = null;
let activeContext: PushNotificationAccountContext | null = null;
let deliveredSignature: string | null = null;
let pendingFlush: ReturnType<typeof setTimeout> | null = null;
let unsubscribePreferences: (() => void) | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

function contextIsCurrent(accountContext: PushNotificationAccountContext): boolean {
  return !accountContext.signal.aborted && accountContext.isCurrent();
}

/**
 * The delivery contract this device asks the server to enforce on its behalf.
 *
 * A remote push that arrives while the app is backgrounded or killed is
 * presented by the OS before any JS runs, so the foreground handler cannot
 * apply these preferences to it. `eventTypes` is the category map already
 * resolved per notification type, which spares the sender from re-deriving a
 * mapping that would then have to be kept in step with this app.
 */
export function buildPushDeliveryPreferences(): PushDeliveryPreferences {
  const { categoryEnabled, quietHours } = useNotificationPrefsStore.getState();
  const eventTypes = {} as Record<NotificationEventType, boolean>;
  for (const type of NOTIFICATION_EVENT_TYPES) {
    eventTypes[type] = categoryEnabled[getCategoryForType(type)] !== false;
  }

  return {
    version: PUSH_DELIVERY_PREFERENCES_VERSION,
    timezone: deviceTimezone(),
    categories: { ...categoryEnabled },
    eventTypes,
    quietHours: {
      enabled: quietHours.enabled === true,
      days: Array.isArray(quietHours.days) ? [...quietHours.days] : [],
      startTime: quietHours.startTime,
      endTime: quietHours.endTime,
      timezone: quietHours.timezone || deviceTimezone(),
    },
    quietHoursExemptEventTypes: [...QUIET_HOURS_EXEMPT_EVENT_TYPES],
  };
}

export async function postPushRegistration(
  token: string,
  accountContext: PushNotificationAccountContext,
): Promise<boolean> {
  try {
    if (!contextIsCurrent(accountContext)) return false;
    const authToken = await accountContext.getAuthToken();
    if (!authToken || !contextIsCurrent(accountContext)) return false;

    const deviceId = await getDeviceId();
    if (!contextIsCurrent(accountContext)) return false;

    const preferences = buildPushDeliveryPreferences();
    const signature = JSON.stringify(preferences);
    await api.post(
      PUSH_TOKEN_REGISTRATION_PATH,
      {
        deviceId,
        pushToken: token,
        preferences: { ...preferences, updatedAt: new Date().toISOString() },
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: accountContext.signal,
      },
    );
    deliveredSignature = signature;
    return contextIsCurrent(accountContext);
  } catch {
    return false;
  }
}

async function flushPushPreferences(): Promise<void> {
  const token = activeToken;
  const accountContext = activeContext;
  if (!token || !accountContext) return;
  if (!contextIsCurrent(accountContext)) {
    stopPushPreferenceSync();
    return;
  }
  if (JSON.stringify(buildPushDeliveryPreferences()) === deliveredSignature) return;
  await postPushRegistration(token, accountContext);
}

function scheduleFlush(delayMs: number): void {
  if (pendingFlush) clearTimeout(pendingFlush);
  pendingFlush = setTimeout(() => {
    pendingFlush = null;
    void flushPushPreferences();
  }, delayMs);
}

/**
 * Keeps the server's copy of this device's preferences converged on the local
 * store, which stays the source of truth: a failed push leaves the delivered
 * signature untouched, so the next change or foreground retries it.
 */
export function beginPushPreferenceSync(
  token: string,
  accountContext: PushNotificationAccountContext,
): void {
  activeToken = token;
  activeContext = accountContext;

  unsubscribePreferences ??= useNotificationPrefsStore.subscribe(() => {
    scheduleFlush(PREFERENCE_SYNC_DEBOUNCE_MS);
  });

  appStateSubscription ??= AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === ACTIVE_APP_STATE) void flushPushPreferences();
  });
}

export function stopPushPreferenceSync(): void {
  if (pendingFlush) clearTimeout(pendingFlush);
  pendingFlush = null;
  unsubscribePreferences?.();
  unsubscribePreferences = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  activeToken = null;
  activeContext = null;
  deliveredSignature = null;
}
