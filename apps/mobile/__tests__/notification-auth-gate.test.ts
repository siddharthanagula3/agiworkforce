/**
 * Regression tests for LOW-MOB-3 — notification handler running before
 * authentication has resolved (red-team finding 2026-05).
 *
 * Pre-fix: `setNavigatorReady(true)` was never called by the layout, so
 * `safeNavigate` always took the deferred path; meanwhile
 * `handleNotificationResponse` would call `safeNavigate('/(app)/...)` even
 * when there was no session. The redirect-to-login effect in `_layout.tsx`
 * would normally catch this, but for a frame the navigator could land on
 * `/(app)` and the loading-state of various authenticated stores could
 * read.
 *
 * Post-fix:
 *   1. `_layout.tsx` calls `setNavigatorReady(true)` on mount.
 *   2. `_layout.tsx` calls `setCurrentSession(session)` whenever the
 *      Supabase session changes.
 *   3. `handleNotificationResponse` checks `_currentSession` and routes
 *      to `/(auth)/login` if null.
 *
 * The tests below feed mocked `Notifications.NotificationResponse`
 * objects through the listener path and assert the router was called with
 * the right route in each scenario.
 */

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

// expo-notifications: capture the response listener callback so we can
// invoke it directly from a test.
let capturedResponseListener:
  | ((response: { notification: { request: { content: { data: unknown } } } }) => void)
  | null = null;
jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn((cb: typeof capturedResponseListener) => {
    capturedResponseListener = cb;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getDevicePushTokenAsync: jest.fn().mockResolvedValue({ data: 'fake-token' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'fake-token' }),
  setNotificationCategoryAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
    MAX: 5,
    MIN: 1,
    LOW: 2,
    NONE: 0,
  },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'fake' } } } },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue(undefined), delete: jest.fn() },
}));

jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-fake'),
}));

import {
  setCurrentSession,
  setNavigatorReady,
  setupNotificationListeners,
} from '../services/notifications';

// setupNotificationListeners has a singleton guard — calling it twice
// short-circuits without re-registering. Register once for the whole
// suite; reset only the per-test router spy.
beforeAll(() => {
  setupNotificationListeners();
  setNavigatorReady(true);
});

beforeEach(() => {
  mockRouterPush.mockReset();
});

function fireNotification(data: Record<string, unknown>): void {
  if (!capturedResponseListener) {
    throw new Error('response listener was not captured');
  }
  capturedResponseListener({
    notification: { request: { content: { data } } },
  });
}

describe('handleNotificationResponse — auth gate', () => {
  it('routes to /(auth)/login when no session is set', () => {
    setCurrentSession(null);
    fireNotification({ type: 'task_completed', route: '/(app)/companion' });
    // setTimeout-deferred safeNavigate may take one tick; flush.
    jest.useFakeTimers();
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    // Either the immediate path or the deferred path must have routed to
    // login. We assert the route equals login.
    expect(mockRouterPush).toHaveBeenCalled();
    const lastCall = mockRouterPush.mock.calls[mockRouterPush.mock.calls.length - 1];
    expect(lastCall![0]).toBe('/(auth)/login');
  });

  it('routes to /(auth)/login when session is explicitly cleared after sign-out', () => {
    // Simulate a sign-in then a sign-out before a notification fires.
    setCurrentSession({
      access_token: 't',
      refresh_token: 'r',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'u', app_metadata: {}, user_metadata: {}, aud: 'a', created_at: '' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    setCurrentSession(null);
    fireNotification({ type: 'agent_failed', agentId: 'agent-1' });
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('routes to /(app)/* when a session is present', () => {
    setCurrentSession({
      access_token: 't',
      refresh_token: 'r',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: 'u', app_metadata: {}, user_metadata: {}, aud: 'a', created_at: '' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    fireNotification({ type: 'companion_connected' });
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/companion');
  });

  it('does NOT navigate when notification has no data', () => {
    setCurrentSession(null);
    if (!capturedResponseListener) throw new Error('listener missing');
    capturedResponseListener({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notification: { request: { content: {} as any } },
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
