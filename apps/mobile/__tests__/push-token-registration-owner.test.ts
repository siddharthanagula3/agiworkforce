const mockApiPost = jest.fn();
const mockGetExpoPushToken = jest.fn();
let capturedPushTokenListener: ((token: { data: string }) => void) | undefined;

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
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushToken(...args),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn((listener: (token: { data: string }) => void) => {
    capturedPushTokenListener = listener;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
    MAX: 5,
    MIN: 1,
  },
}));

import {
  registerForPushNotifications,
  setupNotificationListeners,
  type PushNotificationAccountContext,
} from '../services/notifications';

function makeContext(
  overrides: Partial<PushNotificationAccountContext> = {},
): PushNotificationAccountContext {
  const controller = new AbortController();
  return {
    ownerId: 'account-a',
    signal: controller.signal,
    isCurrent: () => true,
    getAuthToken: async () => 'jwt-a',
    ...overrides,
  };
}

describe('push-token registration ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedPushTokenListener = undefined;
    mockApiPost.mockResolvedValue(undefined);
    mockGetExpoPushToken.mockResolvedValue({ data: 'expo-token-a' });
  });

  it('posts the token with the JWT captured for the current Clerk owner', async () => {
    const controller = new AbortController();
    const context = makeContext({ signal: controller.signal });

    await registerForPushNotifications(context);

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/mobile/push-token',
      {
        deviceId: 'device-1',
        pushToken: 'expo-token-a',
        preferences: expect.objectContaining({
          categories: expect.any(Object),
          eventTypes: expect.any(Object),
          quietHours: expect.any(Object),
          timezone: expect.any(String),
        }),
      },
      {
        headers: { Authorization: 'Bearer jwt-a' },
        signal: controller.signal,
      },
    );
  });

  it('does not post when account A becomes stale while Expo resolves its token', async () => {
    let current = true;
    let resolveExpoToken!: (value: { data: string }) => void;
    mockGetExpoPushToken.mockReturnValueOnce(
      new Promise<{ data: string }>((resolve) => {
        resolveExpoToken = resolve;
      }),
    );
    const registration = registerForPushNotifications(makeContext({ isCurrent: () => current }));
    await Promise.resolve();
    current = false;
    resolveExpoToken({ data: 'stale-token-a' });

    await expect(registration).resolves.toBeNull();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('ignores a captured account-A native token-refresh callback after switching to B', async () => {
    let current = true;
    const removeListeners = setupNotificationListeners(makeContext({ isCurrent: () => current }));
    expect(capturedPushTokenListener).toBeDefined();

    current = false;
    capturedPushTokenListener?.({ data: 'stale-refreshed-token-a' });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApiPost).not.toHaveBeenCalled();
    removeListeners();
  });
});
