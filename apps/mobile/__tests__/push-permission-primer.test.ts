const mockApiPost = jest.fn();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetExpoPushToken = jest.fn();

jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
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
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushToken(...args),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5, MIN: 1 },
}));

import {
  enablePushNotifications,
  getPushDeliveryStatus,
  getPushPermissionStatus,
  getPushRegistrationIssue,
  registerForPushNotifications,
  setPushAccountContext,
  type PushNotificationAccountContext,
} from '../services/notifications';

function context(): PushNotificationAccountContext {
  return {
    ownerId: 'account-a',
    signal: new AbortController().signal,
    isCurrent: () => true,
    getAuthToken: async () => 'jwt-a',
  };
}

beforeEach(() => {
  mockApiPost.mockReset().mockResolvedValue({ ok: true });
  mockGetPermissions.mockReset();
  mockRequestPermissions.mockReset();
  mockGetExpoPushToken.mockReset().mockResolvedValue({ data: 'ExponentPushToken[x]' });
  setPushAccountContext(null);
});

// The OS prompt is spent once per install. MOBILE-021: it used to be spent by a
// root-layout effect on Cloud sign-in, with no primer and no denied state.
describe('the push prompt belongs to a user action', () => {
  it('never prompts from the sign-in registration path when permission is undetermined', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });

    await expect(registerForPushNotifications(context())).resolves.toBeNull();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('never prompts from the registration path when permission was denied', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });

    await expect(registerForPushNotifications(context())).resolves.toBeNull();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('registers the token without a prompt once permission is already granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });

    await expect(registerForPushNotifications(context())).resolves.toBe('ExponentPushToken[x]');

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalled();
  });

  it('prompts only from the explicit enable path, and only while undetermined', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });

    await expect(enablePushNotifications()).resolves.toBe('granted');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('spends no prompt on the enable path when permission is already granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });

    await expect(enablePushNotifications()).resolves.toBe('granted');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('reports a refusal back to the caller so settings can offer the OS settings link', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await expect(enablePushNotifications()).resolves.toBe('denied');

    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    await expect(getPushPermissionStatus()).resolves.toBe('denied');
  });
});

describe('an allowed permission is not reported as delivery', () => {
  it('reports unregistered when the device cannot produce a push token', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushToken.mockRejectedValue(new Error('Default FirebaseApp is not initialized'));
    setPushAccountContext(context());

    await expect(enablePushNotifications()).resolves.toBe('unregistered');
    expect(getPushRegistrationIssue()).toBe('device_token');
    await expect(getPushDeliveryStatus()).resolves.toBe('unregistered');
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('reports unregistered when AGI Cloud refuses the token', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockApiPost.mockRejectedValue(new Error('503'));
    setPushAccountContext(context());

    await expect(enablePushNotifications()).resolves.toBe('unregistered');
    expect(getPushRegistrationIssue()).toBe('server');
  });

  it('clears the issue once a retry registers the token', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushToken.mockRejectedValueOnce(new Error('no token'));
    setPushAccountContext(context());

    await expect(enablePushNotifications()).resolves.toBe('unregistered');
    await expect(enablePushNotifications()).resolves.toBe('granted');
    expect(getPushRegistrationIssue()).toBeNull();
    await expect(getPushDeliveryStatus()).resolves.toBe('granted');
  });

  it('forgets the issue when the account context ends', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushToken.mockRejectedValue(new Error('no token'));
    setPushAccountContext(context());
    await enablePushNotifications();

    setPushAccountContext(null);

    expect(getPushRegistrationIssue()).toBeNull();
    await expect(getPushDeliveryStatus()).resolves.toBe('granted');
  });
});
