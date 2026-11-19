const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

type Handler = (notification: {
  request: { content: { data: unknown } };
}) => Promise<{ shouldShowBanner: boolean; shouldShowList: boolean }>;
type ResponseListener = (response: {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data: unknown } } };
}) => void;
type ReceivedListener = (notification: {
  request: { identifier: string; content: { title: string; body: string; data: unknown } };
}) => void;

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  __esModule: true,
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'fake' } } } },
}));

const mockAppState = { currentState: 'active' as string };
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    get currentState() {
      return mockAppState.currentState;
    },
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue(undefined), delete: jest.fn() },
}));

const mockOpenUntrusted = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn(),
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrusted(...args),
}));

jest.mock('@/lib/constants', () => ({ API_URL: 'https://example.test/' }));

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

import {
  notificationCenterStore,
  setNavigatorReady,
  setSignedIn,
  setupNotificationListeners,
} from '../services/notifications';
import {
  REPLY_READY_BODY,
  REPLY_READY_TITLE,
  announceReplyReadyInBackground,
} from '../services/replyReadyNotice';
import { setFocusedConversation } from '../services/conversationFocus';
import {
  useNotificationPrefsStore,
  DEFAULT_CATEGORY_ENABLED,
} from '../stores/notificationPrefsStore';

const notificationsMock = jest.requireMock('expo-notifications') as Record<string, jest.Mock>;
const mockSchedule = notificationsMock['scheduleNotificationAsync']!;

function lastArgument<T>(mock: jest.Mock | undefined): T {
  const calls = mock?.mock.calls ?? [];
  if (calls.length === 0) throw new Error('expected a registration');
  return calls[calls.length - 1]![0] as T;
}

const mockCaptured: {
  handler: Handler | null;
  response: ResponseListener | null;
  received: ReceivedListener | null;
} = { handler: null, response: null, received: null };

const CLOUD_CONVERSATION = '0190a000-0000-7000-8000-000000000099';
const LOCAL_CONVERSATION = 'conv_1763000000000_abc1234';
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

function reply(conversationId: string) {
  return { request: { content: { data: { type: 'chat_message', conversationId } } } };
}

function tap(data: Record<string, unknown>): void {
  if (!mockCaptured.response) throw new Error('response listener was not captured');
  mockCaptured.response({
    actionIdentifier: DEFAULT_ACTION,
    notification: { request: { identifier: `tap-${Math.random()}`, content: { data } } },
  });
}

beforeAll(async () => {
  await useNotificationPrefsStore.persist.rehydrate();
  setupNotificationListeners(null);
  setNavigatorReady(true);
  mockCaptured.handler = lastArgument<{ handleNotification: Handler }>(
    notificationsMock['setNotificationHandler'],
  ).handleNotification;
  mockCaptured.response = lastArgument<ResponseListener>(
    notificationsMock['addNotificationResponseReceivedListener'],
  );
  mockCaptured.received = lastArgument<ReceivedListener>(
    notificationsMock['addNotificationReceivedListener'],
  );
});

beforeEach(() => {
  mockRouterPush.mockReset();
  mockSchedule.mockClear();
  mockOpenUntrusted.mockClear();
  mockAppState.currentState = 'active';
  setFocusedConversation(null);
  notificationCenterStore.clear();
  useNotificationPrefsStore.setState({ categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED } });
});

describe('a reply notice while the app is open', () => {
  it('is not shown while that chat is open in the foreground', async () => {
    setFocusedConversation(CLOUD_CONVERSATION);

    const shown = await mockCaptured.handler!(reply(CLOUD_CONVERSATION));

    expect(shown.shouldShowBanner).toBe(false);
    expect(shown.shouldShowList).toBe(false);
  });

  it('is shown while another chat is open', async () => {
    setFocusedConversation(LOCAL_CONVERSATION);

    const shown = await mockCaptured.handler!(reply(CLOUD_CONVERSATION));

    expect(shown.shouldShowBanner).toBe(true);
  });

  it('is not kept in the notification list while that chat is open', () => {
    setFocusedConversation(CLOUD_CONVERSATION);
    mockCaptured.received!({
      request: {
        identifier: 'push-1',
        content: {
          title: REPLY_READY_TITLE,
          body: REPLY_READY_BODY,
          ...reply(CLOUD_CONVERSATION).request.content,
        },
      },
    });

    expect(notificationCenterStore.getAll()).toHaveLength(0);
  });

  it('is not shown when Chat replies is off', async () => {
    useNotificationPrefsStore.setState({
      categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED, chat_replies: false },
    });

    const shown = await mockCaptured.handler!(reply(CLOUD_CONVERSATION));

    expect(shown.shouldShowBanner).toBe(false);
  });
});

describe('announceReplyReadyInBackground', () => {
  it('schedules one on-device notice that names the chat when the app is in the background', async () => {
    mockAppState.currentState = 'background';

    await expect(announceReplyReadyInBackground(LOCAL_CONVERSATION)).resolves.toBe(true);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const [{ content }] = mockSchedule.mock.calls[0] as [
      { content: { title: string; body: string; data: Record<string, unknown> } },
    ];
    expect(content.title).toBe(REPLY_READY_TITLE);
    expect(content.body).toBe(REPLY_READY_BODY);
    expect(content.data).toMatchObject({
      type: 'chat_message',
      conversationId: LOCAL_CONVERSATION,
    });
  });

  it('does nothing while the app is in the foreground', async () => {
    await expect(announceReplyReadyInBackground(LOCAL_CONVERSATION)).resolves.toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('does nothing when Chat replies is off', async () => {
    mockAppState.currentState = 'background';
    useNotificationPrefsStore.setState({
      categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED, chat_replies: false },
    });

    await expect(announceReplyReadyInBackground(LOCAL_CONVERSATION)).resolves.toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe('tapping a reply or product update notice', () => {
  it('opens a Local chat without a signed-in account', () => {
    setSignedIn(false);

    tap({ type: 'chat_message', conversationId: LOCAL_CONVERSATION });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: LOCAL_CONVERSATION },
    });
  });

  it('opens the Cloud chat the reply belongs to', () => {
    setSignedIn(true);

    tap({ type: 'chat_message', conversationId: CLOUD_CONVERSATION });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: CLOUD_CONVERSATION },
    });
  });

  it('opens the release note a product update names', async () => {
    setSignedIn(true);

    tap({ type: 'product_update', release: '2026-09-27' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockOpenUntrusted).toHaveBeenCalledWith(
      'https://example.test/release-notes/2026-09-27?from=mobile',
    );
  });

  it('never builds a link from a malformed release name', async () => {
    setSignedIn(true);

    tap({ type: 'product_update', release: '../account' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockOpenUntrusted).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/(app)/notifications' });
  });
});
