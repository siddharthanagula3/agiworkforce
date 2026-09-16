const mockMmkvValues = new Map<string, string>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: { push: jest.fn() },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  __esModule: true,
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5, NONE: 0 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'token' }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  setNotificationCategoryAsync: jest.fn(),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'fake' } } } },
}));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue(undefined), delete: jest.fn() },
}));

jest.mock('@/lib/deviceId', () => ({ getDeviceId: jest.fn().mockResolvedValue('device-fake') }));

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => void mockMmkvValues.set(key, value),
    delete: (key: string) => void mockMmkvValues.delete(key),
  },
  mmkvStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
}));

import * as Notifications from 'expo-notifications';
import { whenMmkvReady } from '@/lib/mmkv';
import {
  androidChannelId,
  registerAndroidChannels,
  IOS_INTERRUPTION_LEVELS,
  NOTIFICATION_PRIORITIES,
} from '../services/notificationChannels';
import {
  scheduleLocalNotification,
  registerForPushNotifications,
  enablePushNotifications,
  notificationCenterStore,
} from '../services/notifications';
import { useNotificationPrefsStore } from '../stores/notificationPrefsStore';

const startupHydrations = (whenMmkvReady as jest.Mock).mock.calls.length;
const setChannel = Notifications.setNotificationChannelAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const getPermissions = Notifications.getPermissionsAsync as jest.Mock;

function scheduledContent(call = 0): Record<string, unknown> {
  const [request] = schedule.mock.calls[call] as [{ content: Record<string, unknown> }];
  return request.content;
}

function accountContext() {
  return {
    ownerId: 'user-1',
    signal: new AbortController().signal,
    isCurrent: () => true,
    getAuthToken: async () => 'token',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getPermissions.mockResolvedValue({ status: 'granted' });
  requestPermissions.mockResolvedValue({ status: 'granted' });
  mockMmkvValues.clear();
  notificationCenterStore.clear();
  useNotificationPrefsStore.setState({
    vibrationEnabled: { critical: true, high: true, normal: false, low: false },
  });
});

describe('NEW-mqa-03, the vibration toggles drive real channels', () => {
  it('gives every priority a vibrating channel and a silent twin', async () => {
    await registerAndroidChannels();

    const created = Object.fromEntries(
      setChannel.mock.calls.map(([id, config]: [string, { enableVibrate: boolean }]) => [
        id,
        config,
      ]),
    );

    for (const priority of NOTIFICATION_PRIORITIES) {
      expect(created[androidChannelId(priority, true)]?.enableVibrate).toBe(true);
      expect(created[androidChannelId(priority, false)]?.enableVibrate).toBe(false);
    }
    expect(androidChannelId('high', true)).not.toBe(androidChannelId('high', false));
  });

  it('posts on the vibrating channel when the toggle is on', async () => {
    await scheduleLocalNotification({
      title: 'Approval',
      body: 'waiting',
      type: 'agent_approval_needed',
    });

    expect(scheduledContent()['channelId']).toBe(androidChannelId('high', true));
  });

  it('posts on the silent channel when the toggle is off', async () => {
    useNotificationPrefsStore.getState().setVibrationEnabled('high', false);

    await scheduleLocalNotification({
      title: 'Approval',
      body: 'waiting',
      type: 'agent_approval_needed',
    });

    expect(scheduledContent()['channelId']).toBe(androidChannelId('high', false));
  });

  it('maps every priority to a distinct iOS interruption level band', async () => {
    await scheduleLocalNotification({ title: 'Heartbeat', body: 'ok', type: 'heartbeat_info' });

    expect(scheduledContent()['interruptionLevel']).toBe('passive');
    expect(IOS_INTERRUPTION_LEVELS.normal).toBe('active');
    expect(IOS_INTERRUPTION_LEVELS.low).not.toBe(IOS_INTERRUPTION_LEVELS.normal);
    expect(IOS_INTERRUPTION_LEVELS.high).not.toBe(IOS_INTERRUPTION_LEVELS.normal);
  });
});

describe('MOBILE-021, the OS prompt belongs to an explicit user action', () => {
  it('never asks for permission while registering a push token', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' });

    const token = await registerForPushNotifications(accountContext());

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(token).toBeNull();
  });

  it('asks only when the user turns notifications on', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' });
    requestPermissions.mockResolvedValue({ status: 'denied' });

    await expect(enablePushNotifications()).resolves.toBe('denied');
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal instead of registering anyway', async () => {
    getPermissions.mockResolvedValue({ status: 'denied' });
    requestPermissions.mockResolvedValue({ status: 'denied' });

    await expect(enablePushNotifications()).resolves.toBe('denied');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});

describe('NEW-mqa-18 and NEW-mqa-30, history survives a relaunch and never doubles up', () => {
  function delivered(id: string, title: string) {
    return {
      request: {
        identifier: id,
        content: { title, body: 'body', data: { type: 'task_completed' } },
      },
    } as unknown as Notifications.Notification;
  }

  it('writes the history where a relaunch can read it back', () => {
    notificationCenterStore.add(delivered('a', 'First'));

    expect(mockMmkvValues.get('notification-center-items')).toContain('First');
  });

  it('rehydrates from storage at startup, not only on demand', () => {
    expect(startupHydrations).toBe(1);
  });

  it('restores history and unread count once storage is ready', () => {
    notificationCenterStore.add(delivered('a', 'First'));
    notificationCenterStore.clear();
    mockMmkvValues.set(
      'notification-center-items',
      JSON.stringify([
        {
          id: 'a',
          title: 'First',
          body: 'body',
          data: { type: 'task_completed' },
          priority: 'normal',
          receivedAt: '2026-09-16T10:00:00.000Z',
          read: false,
        },
      ]),
    );

    expect(notificationCenterStore.getAll()).toHaveLength(0);
    notificationCenterStore.hydrate();

    expect(notificationCenterStore.getAll()).toHaveLength(1);
    expect(notificationCenterStore.getUnreadCount()).toBe(1);
  });

  it('keeps one entry per notification id', () => {
    notificationCenterStore.add(delivered('same-id', 'First'));
    notificationCenterStore.add(delivered('same-id', 'Second'));

    const items = notificationCenterStore.getAll();
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Second');
  });
});
