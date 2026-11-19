import { AppState } from 'react-native';
import { MobilePushPreferencesSchema } from '@agiworkforce/cloud-contracts';

const mockApiPost = jest.fn();
let capturedNotificationHandler:
  ((notification: { request: { content: { data?: unknown } } }) => Promise<unknown>) | undefined;

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
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
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
import {
  beginPushRegistration,
  postPushRegistration,
  stopPushPreferenceSync,
} from '../services/pushPreferenceSync';
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
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockApiPost.mockResolvedValue(undefined);
    appStateListener = undefined;
    await useNotificationPrefsStore.persist.rehydrate();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event: string, handler: (state: string) => void) => {
        appStateListener = handler;
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    useNotificationPrefsStore.setState({
      categoryEnabled: {
        chat_replies: true,
        tasks: true,
        scheduled_tasks: true,
        product_updates: false,
        product: false,
      },
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
      chat_replies: true,
      tasks: true,
      scheduled_tasks: true,
      product_updates: false,
      product: false,
    });
    expect(body.preferences.eventTypes.product_update).toBe(false);
    expect(MobilePushPreferencesSchema.safeParse(body.preferences).success).toBe(true);
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

  it('keeps opt-in groups off on the server when the stored value lacks them', async () => {
    useNotificationPrefsStore.setState({
      categoryEnabled: {
        chat_replies: true,
        tasks: true,
        scheduled_tasks: true,
      } as never,
    });

    await registerForPushNotifications(makeContext());

    const { eventTypes } = bodyOfCall(0).preferences;
    expect(eventTypes.product_update).toBe(false);
    expect(eventTypes.status_update).toBe(false);
    expect(eventTypes.heartbeat_info).toBe(false);
    expect(eventTypes.chat_message).toBe(true);
    expect(eventTypes.schedule_run).toBe(true);
  });

  it('re-syncs the server copy when a category is switched off', async () => {
    await registerForPushNotifications(makeContext());
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    const body = bodyOfCall(1);
    expect(body.preferences.categories.tasks).toBe(false);
    expect(body.preferences.eventTypes.task_completed).toBe(false);
    expect(body.preferences.eventTypes.agent_approval_needed).toBe(false);
    expect(body.preferences.eventTypes.schedule_run).toBe(true);
    expect(body.preferences.eventTypes.chat_message).toBe(true);
  });

  it('tells the server when scheduled tasks alone are muted and product updates are on', async () => {
    await registerForPushNotifications(makeContext());

    useNotificationPrefsStore.getState().setCategoryEnabled('scheduled_tasks', false);
    useNotificationPrefsStore.getState().setCategoryEnabled('product_updates', true);
    jest.runOnlyPendingTimers();
    await settle();

    const body = bodyOfCall(1);
    expect(body.preferences.eventTypes.schedule_run).toBe(false);
    expect(body.preferences.eventTypes.schedule_triggered).toBe(false);
    expect(body.preferences.eventTypes.task_completed).toBe(true);
    expect(body.preferences.eventTypes.agent_approval_needed).toBe(true);
    expect(body.preferences.eventTypes.product_update).toBe(true);
    expect(body.preferences.eventTypes.status_update).toBe(false);
  });

  it('syncs a category switched off while the first registration is still in flight', async () => {
    let resolveFirst!: () => void;
    mockApiPost.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const registration = beginPushRegistration('expo-token-a', makeContext());
    const first = postPushRegistration(registration);
    await settle();

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    resolveFirst();
    await expect(first).resolves.toBe(true);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(bodyOfCall(0).preferences.categories.tasks).toBe(true);
    expect(bodyOfCall(1).preferences.categories.tasks).toBe(false);
    expect(bodyOfCall(1).preferences.eventTypes.task_completed).toBe(false);
  });

  it('turns off only chat reply pushes when chat replies are switched off', async () => {
    await registerForPushNotifications(makeContext());

    useNotificationPrefsStore.getState().setCategoryEnabled('chat_replies', false);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(2);
    const { categories, eventTypes } = bodyOfCall(1).preferences;
    expect(categories.chat_replies).toBe(false);
    expect(eventTypes.chat_message).toBe(false);
    expect(eventTypes.task_completed).toBe(true);
    expect(eventTypes.agent_approval_needed).toBe(true);
  });

  it('does not re-post when nothing about the preferences changed', async () => {
    await registerForPushNotifications(makeContext());

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', true);
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

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    jest.runOnlyPendingTimers();
    await settle();

    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('does not publish an old token receipt over the replacement lifetime', async () => {
    const context = makeContext();
    let resolveOld!: () => void;
    mockApiPost.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const old = beginPushRegistration('old-token', context);
    const oldPost = postPushRegistration(old);
    await settle();

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    const replacement = beginPushRegistration('new-token', context);
    await postPushRegistration(replacement);
    resolveOld();
    await expect(oldPost).resolves.toBe(false);
    expect(old.isCurrent()).toBe(false);

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', true);
    jest.runOnlyPendingTimers();
    await settle();
    expect(mockApiPost).toHaveBeenCalledTimes(3);
    expect(bodyOfCall(2).pushToken).toBe('new-token');
    expect(bodyOfCall(2).preferences.categories.tasks).toBe(true);
  });

  it('fences a stopped registration even when the identical context and token restart', async () => {
    const context = makeContext();
    let resolveOld!: () => void;
    mockApiPost.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const old = beginPushRegistration('same-token', context);
    const oldPost = postPushRegistration(old);
    await settle();
    stopPushPreferenceSync();
    const replacement = beginPushRegistration('same-token', context);
    expect(replacement).not.toBe(old);
    resolveOld();
    await expect(oldPost).resolves.toBe(false);
    expect(appStateListener).toBeUndefined();
    expect(replacement.isCurrent()).toBe(true);
  });

  it('accepts a same-lifetime success after a newer request fails', async () => {
    const context = makeContext();
    let resolveFirst!: () => void;
    mockApiPost.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const registration = beginPushRegistration('same-token', context);
    const first = postPushRegistration(registration);
    await settle();
    expect(beginPushRegistration('same-token', context)).toBe(registration);
    mockApiPost.mockRejectedValueOnce(new Error('offline'));
    await expect(postPushRegistration(registration)).resolves.toBe(false);
    resolveFirst();
    await expect(first).resolves.toBe(true);
    appStateListener?.('active');
    await settle();
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it('ignores retired foreground callbacks without stopping the replacement', async () => {
    const context = makeContext();
    await postPushRegistration(beginPushRegistration('old-token', context));
    const oldForeground = appStateListener;
    const replacement = beginPushRegistration('new-token', context);
    await postPushRegistration(replacement);
    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    oldForeground?.('active');
    await settle();
    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(replacement.isCurrent()).toBe(true);
    jest.runOnlyPendingTimers();
    await settle();
    expect(mockApiPost).toHaveBeenCalledTimes(3);
  });

  it('still suppresses a foreground notification whose category is off', async () => {
    expect(capturedNotificationHandler).toBeDefined();

    const allowed = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'agent_approval_needed' } } },
    })) as { shouldShowBanner: boolean };
    expect(allowed.shouldShowBanner).toBe(true);

    const suppressedByCategory = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'heartbeat_info' } } },
    })) as { shouldShowBanner: boolean };
    expect(suppressedByCategory.shouldShowBanner).toBe(false);

    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
    const suppressedAfterToggle = (await capturedNotificationHandler?.({
      request: { content: { data: { type: 'agent_approval_needed' } } },
    })) as { shouldShowBanner: boolean };
    expect(suppressedAfterToggle.shouldShowBanner).toBe(false);
  });
});
