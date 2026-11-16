const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
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

const mockFeatures = { companion: true };
jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return {
    ...actual,
    FEATURES: new Proxy(actual.FEATURES, {
      get: (target, key) => (key === 'companion' ? mockFeatures.companion : target[key]),
    }),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'fake' } } } },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue(undefined), delete: jest.fn() },
}));

const mockOpenInAppBrowser = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
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
  setNavigatorReady,
  setPushTypeReceivedListener,
  setSignedIn,
  setupNotificationListeners,
} from '../services/notifications';
import { AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER } from '../services/notificationCategories';
import { useNotificationPrefsStore } from '../stores/notificationPrefsStore';

beforeAll(() => {
  setPushTypeReceivedListener((type) =>
    useNotificationPrefsStore.getState().notePushTypeReceived(type),
  );
  setupNotificationListeners(null);
  setNavigatorReady(true);
});

beforeEach(() => {
  mockRouterPush.mockReset();
  mockFeatures.companion = true;
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
  it('opens Local Mode, not the sign-in wall, when no session is set', () => {
    setSignedIn(false);
    fireNotification({ type: 'task_completed', route: '/(app)/companion' });
    jest.useFakeTimers();
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    expect(mockRouterPush).toHaveBeenCalled();
    const lastCall = mockRouterPush.mock.calls[mockRouterPush.mock.calls.length - 1];
    expect(lastCall![0]).toEqual({ pathname: '/(app)' });
  });

  it('opens Local Mode when the session is explicitly cleared after sign-out', () => {
    setSignedIn(true);
    setSignedIn(false);
    fireNotification({ type: 'agent_failed', agentId: 'agent-1' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)' });
    expect(mockRouterPush).not.toHaveBeenCalledWith({ pathname: '/(auth)/login' });
  });

  it('routes to /(app)/* when a session is present', () => {
    setSignedIn(true);
    fireNotification({ type: 'companion_connected' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('opens the authenticated approval review surface from the category action', () => {
    setSignedIn(true);

    fireNotification(
      { type: 'agent_approval_needed', approvalId: 'approval-1' },
      AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER,
    );

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('opens the screen that holds a linked research report', () => {
    setSignedIn(true);

    fireNotification({
      type: 'task_completed',
      route: '/(app)/companion',
      target: 'research',
      targetId: 'report-1',
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/reports');
    expect(mockOpenInAppBrowser).not.toHaveBeenCalled();
  });

  it('opens a linked chat through the route that loads it from the account first', () => {
    setSignedIn(true);

    fireNotification({ type: 'task_completed', target: 'chat', targetId: 'conv-1' });

    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/open/chat/conv-1');
    expect(mockOpenInAppBrowser).not.toHaveBeenCalled();
  });

  it('ignores a product link naming a target this build does not know', () => {
    setSignedIn(true);

    fireNotification({ type: 'companion_connected', target: 'invoice', targetId: 'inv-1' });

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('ignores unknown notification actions', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setSignedIn(true);

    fireNotification({ type: 'agent_approval_needed' }, 'unexpected_action');

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[notifications] Ignored unknown notification action:',
      'unexpected_action',
    );
    warn.mockRestore();
  });

  it('does NOT navigate when notification has no data', () => {
    setSignedIn(false);
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
    setSignedIn(true);
  }

  for (const type of ['agent_failed', 'emergency_stop_triggered', 'agent_paused']) {
    it(`routes ${type} to the live /(app)/tasks runs list (not a per-agent detail)`, () => {
      signIn();
      fireNotification({ type, agentId: 'agent-1' });
      expect(mockRouterPush).toHaveBeenCalledWith('/(app)/tasks');
      for (const call of mockRouterPush.mock.calls) {
        const target = call[0] as { pathname?: string } | string;
        const pathname = typeof target === 'string' ? target : target?.pathname;
        expect(pathname).not.toBe('/(app)/companion/agent/[id]');
        expect(pathname).not.toBe('/(app)/agents');
      }
    });
  }

  it('opens the chat a finished video notice names', () => {
    signIn();
    fireNotification({
      type: 'chat_message',
      route: '/(app)/(tabs)/chat',
      conversationId: '0190a000-0000-7000-8000-000000000123',
      videoJobId: 'job-1',
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: '0190a000-0000-7000-8000-000000000123' },
    });
  });

  it('routes agent lifecycle notifications to /(app)/tasks even without an agentId', () => {
    signIn();
    fireNotification({ type: 'agent_failed' });
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/tasks');
  });

  it('opens the approval a code-session notification is about, not the list of sessions', () => {
    signIn();
    fireNotification({
      type: 'agent_approval_needed',
      rootId: 'root-1',
      threadId: 'thread-1',
      approvalId: 'req-9',
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/companion/code/[threadId]',
      params: { threadId: 'thread-1', rootId: 'root-1', approvalId: 'req-9' },
    });
  });

  it('opens the agent an escalated approval is about when the payload names one', () => {
    signIn();
    fireNotification({
      type: 'approval_pending_escalation',
      agentId: 'agent-7',
      requestId: 'req-3',
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/companion/agent/[id]',
      params: { id: 'agent-7', approvalId: 'req-3' },
    });
  });

  it('still opens the session list when an approval notification names no session', () => {
    signIn();
    fireNotification({ type: 'agent_approval_needed' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  for (const type of ['agent_approval_needed', 'task_completed', 'agent_failed']) {
    it(`opens the cloud run a ${type} push names, where it can be answered`, () => {
      signIn();
      fireNotification({ type, priority: 'high', route: '/(app)/tasks', runId: 'run-1' });
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/(app)/tasks',
        params: { runId: 'run-1' },
      });
    });
  }

  it('routes the schedule_run push the web backend actually sends to /(app)/schedules', () => {
    signIn();
    fireNotification({ type: 'schedule_run', taskId: 'task-1' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/schedules' });
    expect(mockRouterPush).not.toHaveBeenCalledWith({ pathname: '/(app)' });
  });

  it('opens a new chat from the usage limit reset push the web backend sends', () => {
    signIn();
    fireNotification({ type: 'usage_limit_reset', url: '/chat' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/chat' });
    expect(mockRouterPush).not.toHaveBeenCalledWith({ pathname: '/(app)' });
  });
});

describe('handleNotificationResponse, Remote Control hidden in this build', () => {
  beforeEach(() => {
    setSignedIn(true);
    mockFeatures.companion = false;
  });

  it('opens the in-app notifications list for an approval that names no session', () => {
    fireNotification({ type: 'agent_approval_needed' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/notifications' });
    expect(mockRouterPush).not.toHaveBeenCalledWith({ pathname: '/(app)/companion' });
  });

  it('opens the in-app notifications list for a desktop session notification', () => {
    fireNotification({ type: 'companion_connected' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/notifications' });
  });

  it('does not open a hidden code-session or agent screen for an approval', () => {
    fireNotification({
      type: 'agent_approval_needed',
      rootId: 'root-1',
      threadId: 'thread-1',
      approvalId: 'req-9',
    });
    fireNotification({ type: 'approval_pending_escalation', agentId: 'agent-7' });
    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, { pathname: '/(app)/notifications' });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, { pathname: '/(app)/notifications' });
  });

  it('still opens the cloud run an approval push names', () => {
    fireNotification({ type: 'agent_approval_needed', runId: 'run-1' });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/tasks',
      params: { runId: 'run-1' },
    });
  });
});

describe('handleNotificationResponse, research and AGI Code notices', () => {
  const RESEARCH_CONVERSATION = '0190a000-0000-7000-8000-000000000456';

  beforeAll(async () => {
    await useNotificationPrefsStore.persist.rehydrate();
  });

  beforeEach(() => {
    setSignedIn(true);
    mockFeatures.companion = false;
    useNotificationPrefsStore.setState({ announcedPushGroups: [] });
  });

  it('opens the conversation that holds a finished research report', () => {
    fireNotification({
      type: 'research_completed',
      route: '/(app)/reports',
      target: 'research',
      targetId: 'report-1',
      conversationId: RESEARCH_CONVERSATION,
      runId: 'run-1',
    });
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith(`/(app)/open/chat/${RESEARCH_CONVERSATION}`);
  });

  it('opens the reports list when the research notice names no conversation', () => {
    fireNotification({
      type: 'research_completed',
      route: '/(app)/reports',
      target: 'research',
      targetId: 'report-1',
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/reports');

    mockRouterPush.mockReset();
    fireNotification({ type: 'research_completed' });
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/reports' });
  });

  for (const type of [
    'code_session_completed',
    'code_session_failed',
    'code_session_needs_input',
  ]) {
    it(`opens the AGI Code session a ${type} push names`, () => {
      fireNotification({ type, priority: 'high', codeSessionId: 'session-1' });
      expect(mockRouterPush).toHaveBeenCalledWith('/(app)/cloud-code/session-1');
    });

    it(`opens the AGI Code sessions list when a ${type} push names no session`, () => {
      fireNotification({ type });
      expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/cloud-code' });
    });
  }

  it('shows the research and AGI Code switches once their first notice is opened', () => {
    fireNotification({ type: 'task_completed', runId: 'run-1' });
    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual([]);

    fireNotification({ type: 'code_session_failed', codeSessionId: 'session-1' });
    fireNotification({ type: 'research_completed', target: 'research', targetId: 'report-1' });

    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual(['code', 'research']);
  });
});
