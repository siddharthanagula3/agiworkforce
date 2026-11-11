import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockPush = jest.fn();
const mockMarkDeviceRead = jest.fn();
const mockOpenInAppBrowser = jest.fn();
let mockDeviceItems: unknown[] = [];

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

jest.mock('@/lib/constants', () => ({ API_URL: 'https://agiworkforce.com' }));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('@/services/notifications', () => ({
  cloudRunNotificationRoute: () => null,
  getPriorityLabel: (priority: string) => priority,
  useNotificationCenter: () => ({
    items: mockDeviceItems,
    unreadCount: 0,
    markRead: mockMarkDeviceRead,
    markAllRead: jest.fn(),
    clear: jest.fn(),
  }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: new Proxy({}, { get: () => true }),
}));

jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.map((item, index) => (
          <View key={index}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

import NotificationCenterScreen from '../app/(app)/notifications/index';
import {
  accountNotificationDestination,
  useAccountNotificationFeed,
} from '../src/features/notifications/accountFeed';
import { useWaitlistStore } from '../src/features/waitlist/store';

const RUN_ID = '0190a000-0000-7000-8000-000000000031';
const CHAT_ID = '0190a000-0000-7000-8000-000000000032';

function feedItem(overrides: Record<string, unknown>) {
  return {
    id: '0190a000-0000-7000-8000-000000000041',
    category: 'agent_run',
    severity: 'success',
    title: 'Task finished',
    message: 'Your research run is done.',
    href: `/open/work/${RUN_ID}`,
    read: false,
    createdAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeviceItems = [];
  useAccountNotificationFeed.getState().reset();
  useWaitlistStore.setState({ cloudUnlocked: true });
  mockPatch.mockResolvedValue({ updated: 1 });
});

describe('account notification destinations', () => {
  it('opens product links and chats natively and everything else in the in-app browser', () => {
    expect(accountNotificationDestination(`/open/work/${RUN_ID}`)).toEqual({
      kind: 'native',
      route: `/(app)/tasks?runId=${RUN_ID}`,
    });
    expect(accountNotificationDestination(`/chat/${CHAT_ID}`)).toEqual({
      kind: 'native',
      route: `/(app)/chat/${CHAT_ID}`,
    });
    expect(accountNotificationDestination('/chat?settings=billing')).toEqual({
      kind: 'web',
      url: 'https://agiworkforce.com/chat?settings=billing',
    });
    expect(accountNotificationDestination('//evil.example/x')).toBeNull();
    expect(accountNotificationDestination(null)).toBeNull();
  });
});

describe('notifications inbox, account feed', () => {
  it('shows the account feed alongside device-only notices and drops device copies', async () => {
    mockGet.mockResolvedValue({
      notifications: [feedItem({})],
      unreadCount: 1,
    });
    mockDeviceItems = [
      {
        id: 'push-1',
        title: 'Task finished (push copy)',
        body: 'duplicate of the account row',
        data: { type: 'task_completed' },
        priority: 'normal',
        receivedAt: '2026-09-29T10:00:01.000Z',
        read: false,
      },
      {
        id: 'push-2',
        title: 'Desktop companion connected',
        body: 'Your Mac is online.',
        data: { type: 'companion_connected' },
        priority: 'low',
        receivedAt: '2026-09-29T09:00:00.000Z',
        read: true,
      },
    ];

    render(<NotificationCenterScreen />);

    await waitFor(() => expect(screen.getByText('Task finished')).toBeTruthy());
    expect(mockGet).toHaveBeenCalledWith('/api/notifications?limit=30');
    expect(screen.getByText('Desktop companion connected')).toBeTruthy();
    expect(screen.queryByText('Task finished (push copy)')).toBeNull();
    expect(screen.getByText('1 unread notification')).toBeTruthy();
  });

  it('marks an account notification read on the server and opens its target', async () => {
    mockGet.mockResolvedValue({ notifications: [feedItem({})], unreadCount: 1 });

    render(<NotificationCenterScreen />);
    await waitFor(() => expect(screen.getByText('Task finished')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Unread, Task finished/));
    });

    expect(mockPatch).toHaveBeenCalledWith('/api/notifications', {
      ids: ['0190a000-0000-7000-8000-000000000041'],
    });
    expect(mockPush).toHaveBeenCalledWith(`/(app)/tasks?runId=${RUN_ID}`);
    expect(useAccountNotificationFeed.getState().unreadCount).toBe(0);
  });

  it('restores the unread state when the server refuses the read mark', async () => {
    mockGet.mockResolvedValue({ notifications: [feedItem({ href: null })], unreadCount: 1 });
    mockPatch.mockRejectedValue(new Error('offline'));

    render(<NotificationCenterScreen />);
    await waitFor(() => expect(screen.getByText('Task finished')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Unread, Task finished/));
    });

    await waitFor(() => expect(useAccountNotificationFeed.getState().unreadCount).toBe(1));
    expect(useAccountNotificationFeed.getState().items[0]?.read).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps device notices and offers a retry when the account feed fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));
    mockDeviceItems = [
      {
        id: 'push-1',
        title: 'Task finished on device',
        body: 'kept while the feed is unavailable',
        data: { type: 'task_completed' },
        priority: 'normal',
        receivedAt: '2026-09-29T10:00:01.000Z',
        read: false,
      },
    ];

    render(<NotificationCenterScreen />);

    await waitFor(() =>
      expect(
        screen.getByLabelText('Could not load your account notifications. Retry'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Task finished on device')).toBeTruthy();

    mockGet.mockResolvedValueOnce({ notifications: [feedItem({})], unreadCount: 1 });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Could not load your account notifications. Retry'));
    });
    await waitFor(() => expect(screen.getByText('Task finished')).toBeTruthy());
  });

  it('does not call the account feed while signed out of AGI Cloud', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });

    render(<NotificationCenterScreen />);

    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByText('No notifications yet.')).toBeTruthy();
  });
});

function deferred() {
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

const ID_A = '0190a000-0000-7000-8000-000000000051';
const ID_B = '0190a000-0000-7000-8000-000000000052';
const ID_C = '0190a000-0000-7000-8000-000000000053';

describe('account notification feed read-state ownership', () => {
  it('does not restore a retired account feed when its mark-all request fails late', async () => {
    mockGet.mockResolvedValue({
      notifications: [feedItem({ id: ID_A, title: 'Account A notice' })],
      unreadCount: 1,
    });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    const pending = deferred();
    mockPatch.mockReturnValueOnce(pending.promise);

    act(() => {
      useAccountNotificationFeed.getState().markAllRead();
    });
    act(() => {
      useAccountNotificationFeed.getState().reset();
    });
    mockGet.mockResolvedValue({
      notifications: [feedItem({ id: ID_B, title: 'Account B notice' })],
      unreadCount: 1,
    });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    await act(async () => {
      pending.reject(new Error('offline'));
      await pending.promise.catch(() => undefined);
    });

    const state = useAccountNotificationFeed.getState();
    expect(state.items.map((item) => item.id)).toEqual([ID_B]);
    expect(state.unreadCount).toBe(1);
  });

  it('keeps an older page loaded after mark-all and restores only the rows it changed', async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) =>
      feedItem({
        id: `0190a000-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
        createdAt: `2026-09-29T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
      }),
    );
    mockGet.mockResolvedValueOnce({ notifications: firstPage, unreadCount: 31 });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    const pending = deferred();
    mockPatch.mockReturnValueOnce(pending.promise);
    act(() => {
      useAccountNotificationFeed.getState().markAllRead();
    });
    mockGet.mockResolvedValueOnce({
      notifications: [feedItem({ id: ID_C, createdAt: '2026-09-29T09:00:00.000Z' })],
      unreadCount: 31,
    });
    await act(async () => {
      await useAccountNotificationFeed.getState().loadMore();
    });
    await act(async () => {
      pending.reject(new Error('offline'));
      await pending.promise.catch(() => undefined);
    });

    const state = useAccountNotificationFeed.getState();
    expect(state.items).toHaveLength(31);
    expect(state.items.at(-1)?.id).toBe(ID_C);
    expect(state.items.slice(0, 30).every((item) => !item.read)).toBe(true);
    expect(state.unreadCount).toBe(31);
  });

  it('does not invent an unread count for a row that is no longer in the feed', async () => {
    mockGet.mockResolvedValue({ notifications: [feedItem({ id: ID_A })], unreadCount: 1 });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    const pending = deferred();
    mockPatch.mockReturnValueOnce(pending.promise);
    act(() => {
      useAccountNotificationFeed.getState().markRead(ID_A);
    });
    mockGet.mockResolvedValue({ notifications: [], unreadCount: 0 });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    await act(async () => {
      pending.reject(new Error('offline'));
      await pending.promise.catch(() => undefined);
    });

    expect(useAccountNotificationFeed.getState().unreadCount).toBe(0);
  });

  it('restores every unread row and the unloaded remainder when mark-all fails on an unchanged feed', async () => {
    mockGet.mockResolvedValue({
      notifications: [feedItem({ id: ID_A }), feedItem({ id: ID_B, read: true })],
      unreadCount: 4,
    });
    await act(async () => {
      await useAccountNotificationFeed.getState().refresh();
    });
    mockPatch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      useAccountNotificationFeed.getState().markAllRead();
    });

    await waitFor(() => expect(useAccountNotificationFeed.getState().unreadCount).toBe(4));
    expect(useAccountNotificationFeed.getState().items.map((item) => item.read)).toEqual([
      false,
      true,
    ]);
  });
});
