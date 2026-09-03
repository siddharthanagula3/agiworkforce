const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

let capturedResponseListener:
  | ((response: {
      actionIdentifier: string;
      notification: { request: { content: { data: unknown } } };
    }) => void)
  | null = null;
jest.mock('expo-notifications', () => ({
  __esModule: true,
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
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

// services/notifications reaches @/lib/mmkv through pushPreferenceSync, and
// that module loads expo-secure-store's native binding, which Jest has no host
// for. Every other suite that touches the store mocks it the same way.
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

import {
  setCurrentSession,
  setNavigatorReady,
  setupNotificationListeners,
} from '../services/notifications';
import { AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER } from '../services/notificationCategories';

beforeAll(() => {
  setupNotificationListeners(null);
  setNavigatorReady(true);
});

beforeEach(() => {
  mockRouterPush.mockReset();
});

function fireNotification(
  data: Record<string, unknown>,
  actionIdentifier = 'expo.modules.notifications.actions.DEFAULT',
): void {
  if (!capturedResponseListener) {
    throw new Error('response listener was not captured');
  }
  capturedResponseListener({
    actionIdentifier,
    notification: { request: { content: { data } } },
  });
}

describe('handleNotificationResponse, auth gate', () => {
  it('routes to /(auth)/login when no session is set', () => {
    setCurrentSession(null);
    fireNotification({ type: 'task_completed', route: '/(app)/companion' });
    jest.useFakeTimers();
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    expect(mockRouterPush).toHaveBeenCalled();
    const lastCall = mockRouterPush.mock.calls[mockRouterPush.mock.calls.length - 1];
    expect(lastCall![0]).toEqual({ pathname: '/(auth)/login' });
  });

  it('routes to /(auth)/login when session is explicitly cleared after sign-out', () => {
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
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
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
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('opens the authenticated approval review surface from the category action', () => {
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

    fireNotification(
      { type: 'agent_approval_needed', approvalId: 'approval-1' },
      AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER,
    );

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('ignores unknown notification actions', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
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

    fireNotification({ type: 'agent_approval_needed' }, 'unexpected_action');

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[notifications] Ignored unknown notification action:',
      'unexpected_action',
    );
    warn.mockRestore();
  });

  it('does NOT navigate when notification has no data', () => {
    setCurrentSession(null);
    if (!capturedResponseListener) throw new Error('listener missing');
    capturedResponseListener({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notification: { request: { content: {} as any } },
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('handleNotificationResponse, no dead-end deep links', () => {
  function signIn(): void {
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
  }

  for (const type of ['agent_failed', 'emergency_stop_triggered', 'agent_paused']) {
    it(`routes ${type} to the live /(app)/agents runs list (not the agents-gated detail)`, () => {
      signIn();
      fireNotification({ type, agentId: 'agent-1' });
      expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/agents' });
      for (const call of mockRouterPush.mock.calls) {
        const target = call[0] as { pathname?: string } | string;
        const pathname = typeof target === 'string' ? target : target?.pathname;
        expect(pathname).not.toBe('/(app)/companion/agent/[id]');
        expect(pathname).not.toBe('/(app)/agents/[id]');
      }
    });
  }

  it('routes agent lifecycle notifications to /(app)/agents even without an agentId', () => {
    signIn();
    fireNotification({ type: 'agent_failed' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/agents' });
  });

  it('routes the schedule_run push the web backend actually sends to /(app)/schedules', () => {
    signIn();
    fireNotification({ type: 'schedule_run', taskId: 'task-1' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/schedules' });
    expect(mockRouterPush).not.toHaveBeenCalledWith({ pathname: '/(app)' });
  });
});
