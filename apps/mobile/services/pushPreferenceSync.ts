import {
  AppState,
  Platform,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';
import Constants from 'expo-constants';

import { getDeviceId } from '@/lib/deviceId';
import {
  DEFAULT_CATEGORY_ENABLED,
  deviceTimezone,
  getCategoryForType,
  useNotificationPrefsStore,
  type PushPreferenceGroup,
} from '@/stores/notificationPrefsStore';
import { MOBILE_PUSH_TOKEN_PATH } from '@agiworkforce/cloud-contracts';
import type { TimeFocusWeekday } from '@agiworkforce/types';

import { api } from './api';
import { trackPushRegistrationPost } from './pushRegistrationPosts';
import {
  NOTIFICATION_EVENT_TYPES,
  QUIET_HOURS_EXEMPT_EVENT_TYPES,
  type NotificationEventType,
} from './notificationEventTypes';
import type { PushNotificationAccountContext } from './notifications';

export const PUSH_TOKEN_REGISTRATION_PATH = MOBILE_PUSH_TOKEN_PATH;
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
  categories: Record<PushPreferenceGroup, boolean>;
  eventTypes: Record<NotificationEventType, boolean>;
  quietHours: PushDeliveryQuietHours;
  quietHoursExemptEventTypes: NotificationEventType[];
}

export interface PushRegistrationHandle {
  isCurrent: () => boolean;
}

interface PushRegistration extends PushRegistrationHandle {
  token: string;
  context: PushNotificationAccountContext;
  deliveredSignature: string | null;
  pendingFlush: ReturnType<typeof setTimeout> | null;
  unsubscribePreferences: (() => void) | null;
  appStateSubscription: NativeEventSubscription | null;
}

let activeRegistration: PushRegistration | null = null;
const registrations = new WeakMap<PushRegistrationHandle, PushRegistration>();

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
    const group = getCategoryForType(type);
    eventTypes[type] = DEFAULT_CATEGORY_ENABLED[group]
      ? categoryEnabled[group] !== false
      : categoryEnabled[group] === true;
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

/** Claims a lifetime, but activates preference listeners only after a successful POST. */
export function beginPushRegistration(
  token: string,
  accountContext: PushNotificationAccountContext,
): PushRegistrationHandle {
  if (
    activeRegistration?.token === token &&
    activeRegistration.context === accountContext &&
    activeRegistration.isCurrent()
  ) {
    return activeRegistration;
  }

  // A stale caller cannot retire a newer registration.
  if (!contextIsCurrent(accountContext)) return { isCurrent: () => false };
  stopPushPreferenceSync();
  const registration: PushRegistration = {
    token,
    context: accountContext,
    deliveredSignature: null,
    pendingFlush: null,
    unsubscribePreferences: null,
    appStateSubscription: null,
    isCurrent: () => activeRegistration === registration && contextIsCurrent(accountContext),
  };
  registrations.set(registration, registration);
  activeRegistration = registration;
  return registration;
}

export async function postPushRegistration(handle: PushRegistrationHandle): Promise<boolean> {
  const registration = registrations.get(handle);
  if (!registration) return false;
  const { token, context: accountContext } = registration;
  try {
    if (!registration.isCurrent()) return false;
    const authToken = await accountContext.getAuthToken();
    if (!authToken || !registration.isCurrent()) return false;

    const deviceId = await getDeviceId();
    if (!registration.isCurrent()) return false;

    const preferences = buildPushDeliveryPreferences();
    const signature = JSON.stringify(preferences);
    await trackPushRegistrationPost(
      api.post(
        PUSH_TOKEN_REGISTRATION_PATH,
        {
          deviceId,
          pushToken: token,
          ...(Platform.OS === 'ios' || Platform.OS === 'android' ? { platform: Platform.OS } : {}),
          ...(Constants.deviceName ? { name: Constants.deviceName.slice(0, 120) } : {}),
          preferences: { ...preferences, updatedAt: new Date().toISOString() },
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
          auth401Recovery: 'caller-owned',
          signal: accountContext.signal,
        },
      ),
    );
    if (!registration.isCurrent()) return false;
    // A newer failed request in this same lifetime must not discard this receipt.
    registration.deliveredSignature = signature;
    activatePreferenceSync(registration);
    return true;
  } catch {
    return false;
  }
}

async function flushPushPreferences(registration: PushRegistration): Promise<void> {
  if (activeRegistration !== registration) return;
  if (!registration.isCurrent()) {
    retireRegistration(registration);
    return;
  }
  if (JSON.stringify(buildPushDeliveryPreferences()) === registration.deliveredSignature) return;
  await postPushRegistration(registration);
}

function scheduleFlush(registration: PushRegistration, delayMs: number): void {
  if (!registration.isCurrent()) return;
  if (registration.pendingFlush !== null) clearTimeout(registration.pendingFlush);
  const timer = setTimeout(() => {
    if (!registration.isCurrent() || registration.pendingFlush !== timer) return;
    registration.pendingFlush = null;
    void flushPushPreferences(registration);
  }, delayMs);
  registration.pendingFlush = timer;
}

/** Failed requests retain receipts; the next change or foreground can retry. */
function activatePreferenceSync(registration: PushRegistration): void {
  if (!registration.isCurrent()) return;
  registration.unsubscribePreferences ??= useNotificationPrefsStore.subscribe(() => {
    scheduleFlush(registration, PREFERENCE_SYNC_DEBOUNCE_MS);
  });
  registration.appStateSubscription ??= AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === ACTIVE_APP_STATE) void flushPushPreferences(registration);
    },
  );
  if (JSON.stringify(buildPushDeliveryPreferences()) !== registration.deliveredSignature) {
    scheduleFlush(registration, PREFERENCE_SYNC_DEBOUNCE_MS);
  }
}

function retireRegistration(registration: PushRegistration): void {
  if (activeRegistration === registration) activeRegistration = null;
  if (registration.pendingFlush !== null) clearTimeout(registration.pendingFlush);
  registration.pendingFlush = null;
  registration.unsubscribePreferences?.();
  registration.unsubscribePreferences = null;
  registration.appStateSubscription?.remove();
  registration.appStateSubscription = null;
  registration.deliveredSignature = null;
}

export function stopPushPreferenceSync(): void {
  if (activeRegistration) retireRegistration(activeRegistration);
}
