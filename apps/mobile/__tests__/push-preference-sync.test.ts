import { AppState } from 'react-native';

const mockApiPost = jest.fn();
let capturedNotificationHandler:
  | ((notification: { request: { content: { data?: unknown } } }) => Promise<unknown>)
  | undefined;

jest.mock('../services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn((handler: { handleNotification: unknown }) => {
    capturedNotificationHandler = handler.handleNotification as typeof capturedNotificationHandler;
  }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'expo-token-a' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5, MIN: 1 },
}));

import {
  registerForPushNotifications,
  type PushNotificationAccountContext,
} from '../services/notifications';
import { stopPushPreferenceSync } from '../services/pushPreferenceSync';
import { useNotificationPrefsStore } from '../stores/notificationPrefsStore';
import type { TimeFocusWeekday } from '@agiworkforce/types';

const SETTLE_TICKS = 12;
const SCHEDULE_TIMEZONE = 'America/New_York';
const EVERY_DAY: TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

interface RegistrationBody {
  deviceId: string;
  pushToken: string;
  preferences: {
    version: number;
    timezone: string;
    updatedAt: string;
    categories: Record<string, boolean>;
    eventTypes: Record<string, boolean>;
    quietHours: {
      enabled: boolean;
      days: number[];
      startTime: string;
      endTime: string;
      timezone: string;
    };
    quietHoursExemptEventTypes: string[];
  };
}

function bodyOfCall(index: number): RegistrationBody {
  return mockApiPost.mock.calls[index]?.[1] as RegistrationBody;
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    await Promise.resolve();
  }
}

function makeContext(
  overrides: Partial<PushNotificationAccountContext> = {},
): PushNotificationAccountContext {
  return {
    ownerId: 'account-a',
    signal: new AbortController().signal,
    isCurrent: () => true,
    getAuthToken: async () => 'jwt-a',
    ...overrides,
  };
}

let appStateListener: ((state: string) => void) | undefined;

describe('push delivery preference sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockApiPost.mockResolvedValue(undefined);
    appStateListener = undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event: string, handler: (state: string) => void) => {
        appStateListener = handler;
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    useNotificationPrefsStore.setState({
      categoryEnabled: { approvals: true, task_updates: true, errors: true, status: false },
      quietHours: {
        enabled: true,
        days: EVERY_DAY,
        startTime: '22:00',
        endTime: '08:00',
        timezone: SCHEDULE_TIMEZONE,
      },
    });
  });

  afterEach(() => {
    stopPushPreferenceSync();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('registers the device with its category map, quiet hours and timezone', async () => {
    await registerForPushNotifications(makeContext());

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    const body = bodyOfCall(0);
    expect(body.pushToken).toBe('expo-token-a');
    expect(body.preferences.categories).toEqual({
      approvals: true,
      task_updates: true,
      errors: true,
      status: false,
    });
    expect(body.preferences.quietHours).toEqual({
      enabled: true,
      days: EVERY_DAY,
      startTime: '22:00',
      endTime: '08:00',
      timezone: SCHEDULE_TIMEZONE,
    });
    expect(typeof body.preferences.timezone).toBe('string');
    expect(body.preferences.timezone.length).toBeGreaterThan(0);
    expect(body.preferences.updatedAt).toEqual(expect.any(String));
  });

  it('resolves each notification type against its category so the sender needs no mapping', async () => {
    await registerForPushNotifications(makeContext());

    const { eventTypes, quietHoursExemptEventTypes } = bodyOfCall(0).preferences;
    expect(eventTypes.agent_approval_needed).toBe(true);
    expect(eventTypes.task_completed).toBe(true);
    expect(eventTypes.heartbeat_info).toBe(false);
    expect(eventTypes.status_update).toBe(false);
    expect(quietHoursExemptEventTypes).toContain('agent_failed');
    expect(quietHoursExemptEventTypes).toContain('agent_approval_needed');
  });

  it('re-syncs the server copy when a category is switched off', async () => {
    await registerForPushNotifications(makeContext());
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    useNotificationPrefsStore.getState().setCategoryEnabled('task_updates', false);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    const body = bodyOfCall(1);
    expect(body.preferences.categories.task_updates).toBe(false);
    expect(body.preferences.eventTypes.task_completed).toBe(false);
    expect(body.preferences.eventTypes.chat_message).toBe(false);
  });

  it('does not re-post when nothing about the preferences changed', async () => {
    await registerForPushNotifications(makeContext());

    useNotificationPrefsStore.getState().setCategoryEnabled('approvals', true);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('retries on foreground after a failed change, keeping the device store authoritative', async () => {
    await registerForPushNotifications(makeContext());
    mockApiPost.mockRejectedValueOnce(new Error('offline'));

    useNotificationPrefsStore.getState().setQuietHours({ startTime: '23:30' });
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(useNotificationPrefsStore.getState().quietHours.startTime).toBe('23:30');

    appStateListener?.('active');
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(3);
    expect(bodyOfCall(2).preferences.quietHours.startTime).toBe('23:30');
  });

  it('stops syncing once the account context is no longer current', async () => {
    let current = true;
    await registerForPushNotifications(makeContext({ isCurrent: () => current }));
    current = false;

    useNotificationPrefsStore.getState().setCategoryEnabled('errors', false);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('still suppresses a foreground notification whose category is off', async () => {
    expect(capturedNotificationHandler).toBeDefined();

    const allowed = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'agent_approval_needed' } } },
    })) as { shouldShowAlert: boolean };
    expect(allowed.shouldShowAlert).toBe(true);

    const suppressedByCategory = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'heartbeat_info' } } },
    })) as { shouldShowAlert: boolean };
    expect(suppressedByCategory.shouldShowAlert).toBe(false);

    useNotificationPrefsStore.getState().setCategoryEnabled('approvals', false);
    const suppressedAfterToggle = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'agent_approval_needed' } } },
    })) as { shouldShowAlert: boolean };
    expect(suppressedAfterToggle.shouldShowAlert).toBe(false);
  });
});
