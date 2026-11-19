/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockUnreadCount = 0;
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

// The screen reads live OS permission and channel state, so the OS has to be
// present for it to render at all.
jest.mock('@/services/notifications', () => ({
  getPushPermissionStatus: jest.fn().mockResolvedValue('granted'),
  enablePushNotifications: jest.fn().mockResolvedValue('granted'),
  getPushDeliveryStatus: jest.fn().mockResolvedValue('granted'),
  getPushRegistrationIssue: jest.fn().mockReturnValue(null),
  useNotificationCenter: () => ({ unreadCount: mockUnreadCount }),
}));

jest.mock('@/services/notificationChannels', () => ({
  androidChannelVibrates: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: jest.fn().mockResolvedValue({}),
  savePreferenceNamespace: jest.fn().mockResolvedValue(undefined),
  patchPreferenceNamespace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Bell: icon,
    BellOff: icon,
    Bot: icon,
    CalendarClock: icon,
    CheckSquare: icon,
    ChevronRight: icon,
    Clock: icon,
    CloudOff: icon,
    Info: icon,
    Mail: icon,
    MessageSquare: icon,
    Moon: icon,
    Sparkles: icon,
    Vibrate: icon,
    X: icon,
  };
});

import NotificationPreferencesScreen from '../src/features/settings/notifications';
import NotificationCategoryDetailScreen from '../src/features/settings/notifications/NotificationCategoryDetailScreen';
import { useNotificationPrefsStore } from '../stores/notificationPrefsStore';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

describe('notification category settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkSignedIn: false, isClerkLoaded: false, clerkUserId: null });
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          chat_replies: true,
          tasks: true,
          scheduled_tasks: true,
          product_updates: false,
          product: false,
        },
        vibrationEnabled: {
          critical: true,
          high: true,
          normal: false,
          low: false,
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
        },
      });
    });
  });

  it('summarizes the real channel and opens the selected category detail', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    // The screen reads the OS permission on focus, so let that settle before
    // asserting on a tree it will re-render.
    await screen.findByText('Your device is delivering notifications');

    expect(screen.getByLabelText('Chat replies. Push')).toBeTruthy();
    expect(screen.getByLabelText('Task and approval updates. Push')).toBeTruthy();
    expect(screen.getByLabelText('Scheduled tasks. Push')).toBeTruthy();
    expect(screen.getByLabelText('Product updates. Off')).toBeTruthy();
    expect(screen.getByLabelText('Service status. Off')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Task and approval updates. Push'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/notifications/[category]',
      params: { category: 'tasks' },
    });
  });

  it('opens the list of recent notifications, which no longer has a side panel row', async () => {
    mockUnreadCount = 3;
    const screen = render(<NotificationPreferencesScreen />);

    fireEvent.press(await screen.findByLabelText('Recent notifications. 3 unread'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/notifications');
    mockUnreadCount = 0;
  });

  it('labels the break reminder as a once-a-day threshold, not a repeating interval', async () => {
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
    });
    const screen = render(<NotificationPreferencesScreen />);
    await screen.findByText('Your device is delivering notifications');

    expect(screen.getByLabelText('Break reminder, currently After 30 min today')).toBeTruthy();
    expect(screen.getByText('After 30 min today')).toBeTruthy();
    expect(screen.queryByText(/^Every /)).toBeNull();

    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 120 });
    });
    expect(screen.getByText('After 2 hr today')).toBeTruthy();
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: null });
    });
  });

  it('blocks the per-device category rows while the device denies notifications', async () => {
    const { getPushDeliveryStatus } = require('@/services/notifications');
    (getPushDeliveryStatus as jest.Mock).mockResolvedValueOnce('denied');
    activateCloudAccount('notification-owner');
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useAuthStore.setState({
        isClerkLoaded: true,
        isClerkSignedIn: true,
        clerkUserId: 'notification-owner',
      });
    });
    const screen = render(<NotificationPreferencesScreen />);
    await screen.findByText('Your device is blocking notifications');

    const row = screen.getByLabelText('Task and approval updates. Blocked');
    expect(row).toBeDisabled();
    fireEvent.press(row);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getAllByText('Blocked')).toHaveLength(5);
    expect(
      await screen.findByText(
        'Saved, but this device stays silent until notifications are allowed.',
      ),
    ).toBeTruthy();
  });

  it('changes the live Push preference without creating an inert Email preference', () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);

    expect(screen.getByText('Task and approval updates')).toBeTruthy();
    expect(screen.getByLabelText('Email notifications. Unavailable')).toBeTruthy();
    expect(screen.getByText('No email for this category')).toBeTruthy();

    fireEvent(screen.getByRole('switch'), 'valueChange', false);

    expect(useNotificationPrefsStore.getState().categoryEnabled.tasks).toBe(false);
    expect(useNotificationPrefsStore.getState()).not.toHaveProperty('emailEnabled');
  });

  it.each([
    ['approvals', 'tasks', 'Task and approval updates'],
    ['task_updates', 'tasks', 'Task and approval updates'],
    ['errors', 'tasks', 'Task and approval updates'],
    ['status', 'product', 'Service status'],
  ] as const)('opens the %s link from the old taxonomy on %s', (legacy, current, label) => {
    const screen = render(<NotificationCategoryDetailScreen category={legacy} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Notification category not found')).toBeNull();

    fireEvent(screen.getByRole('switch'), 'valueChange', current === 'product');

    expect(useNotificationPrefsStore.getState().categoryEnabled[current]).toBe(
      current === 'product',
    );
    expect(useNotificationPrefsStore.getState().categoryEnabled).not.toHaveProperty(legacy);
  });

  it('opens the scheduled tasks switch on its own, leaving task and approval updates on', () => {
    const screen = render(<NotificationCategoryDetailScreen category="scheduled_tasks" />);

    expect(screen.getByText('Scheduled tasks')).toBeTruthy();
    expect(screen.getByLabelText('Email notifications. On the web')).toBeTruthy();
    expect(screen.queryByText('No email for this category')).toBeNull();

    fireEvent(screen.getByRole('switch'), 'valueChange', false);

    expect(useNotificationPrefsStore.getState().categoryEnabled.scheduled_tasks).toBe(false);
    expect(useNotificationPrefsStore.getState().categoryEnabled.tasks).toBe(true);
  });

  it('turns product updates on from their own page', () => {
    const screen = render(<NotificationCategoryDetailScreen category="product_updates" />);

    expect(screen.getByText('Product updates')).toBeTruthy();
    fireEvent(screen.getByRole('switch'), 'valueChange', true);

    expect(useNotificationPrefsStore.getState().categoryEnabled.product_updates).toBe(true);
    expect(useNotificationPrefsStore.getState().categoryEnabled.product).toBe(false);
  });

  it('rejects an unknown dynamic category without mutating preferences', () => {
    const before = useNotificationPrefsStore.getState().categoryEnabled;
    const screen = render(<NotificationCategoryDetailScreen category="marketing" />);

    expect(screen.getByText('Notification category not found')).toBeTruthy();
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
  });
});
