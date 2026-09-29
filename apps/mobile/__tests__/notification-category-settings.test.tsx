/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
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
}));

jest.mock('@/services/notificationChannels', () => ({
  androidChannelVibrates: jest.fn().mockResolvedValue(null),
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
    CheckSquare: icon,
    ChevronRight: icon,
    Clock: icon,
    CloudOff: icon,
    Info: icon,
    Mail: icon,
    MessageSquare: icon,
    Moon: icon,
    Vibrate: icon,
    X: icon,
  };
});

import NotificationPreferencesScreen from '../src/features/settings/notifications';
import NotificationCategoryDetailScreen from '../src/features/settings/notifications/NotificationCategoryDetailScreen';
import { useNotificationPrefsStore } from '../stores/notificationPrefsStore';

describe('notification category settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          chat_replies: true,
          tasks: true,
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
    expect(screen.getByLabelText('Product. Off')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Task and approval updates. Push'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/notifications/[category]',
      params: { category: 'tasks' },
    });
  });

  it('changes the live Push preference without creating an inert Email preference', () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);

    expect(screen.getByText('Task and approval updates')).toBeTruthy();
    expect(screen.getByLabelText('Email notifications. Unavailable')).toBeTruthy();
    expect(screen.getByText('No hidden email preference')).toBeTruthy();

    fireEvent(screen.getByRole('switch'), 'valueChange', false);

    expect(useNotificationPrefsStore.getState().categoryEnabled.tasks).toBe(false);
    expect(useNotificationPrefsStore.getState()).not.toHaveProperty('emailEnabled');
  });

  it.each([
    ['approvals', 'tasks', 'Task and approval updates'],
    ['task_updates', 'tasks', 'Task and approval updates'],
    ['errors', 'tasks', 'Task and approval updates'],
    ['status', 'product', 'Product'],
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

  it('rejects an unknown dynamic category without mutating preferences', () => {
    const before = useNotificationPrefsStore.getState().categoryEnabled;
    const screen = render(<NotificationCategoryDetailScreen category="marketing" />);

    expect(screen.getByText('Notification category not found')).toBeTruthy();
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
  });
});
