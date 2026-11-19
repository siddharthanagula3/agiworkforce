jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: { push: jest.fn() },
}));

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  __esModule: true,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'fake' } } } },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue(undefined), delete: jest.fn() },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-fake'),
}));

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import * as Notifications from 'expo-notifications';
import { clearDeliveredNotifications } from '../services/notifications';

describe('clearDeliveredNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dismisses every delivered notification and resets the app badge', async () => {
    await clearDeliveredNotifications();

    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });

  it('still resets the badge, and does not throw, when dismissing is refused', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (Notifications.dismissAllNotificationsAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Notifications permission has not been granted'),
    );

    await expect(clearDeliveredNotifications()).resolves.toBeUndefined();

    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    warning.mockRestore();
  });

  it('does not throw when the badge cannot be set without permission', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (Notifications.setBadgeCountAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Notifications permission has not been granted'),
    );

    await expect(clearDeliveredNotifications()).resolves.toBeUndefined();

    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
