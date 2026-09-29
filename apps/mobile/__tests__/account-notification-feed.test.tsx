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
      route: '/(app)/tasks',
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
    expect(mockPush).toHaveBeenCalledWith('/(app)/tasks');
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
