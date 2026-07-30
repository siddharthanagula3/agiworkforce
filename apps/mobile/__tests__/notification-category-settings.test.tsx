/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    back: jest.fn(),
    canGoBack: () => false,
  }),
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
    AlertOctagon: icon,
    AlertTriangle: icon,
    ArrowLeft: icon,
    Bell: icon,
    BellOff: icon,
    CheckSquare: icon,
    ChevronRight: icon,
    Clock: icon,
    CloudOff: icon,
    Info: icon,
    Mail: icon,
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
          approvals: true,
          task_updates: true,
          errors: true,
          status: false,
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

  it('summarizes the real channel and opens the selected category detail', () => {
    const screen = render(<NotificationPreferencesScreen />);

    expect(screen.getByLabelText('Approvals. Push')).toBeTruthy();
    expect(screen.getByLabelText('Work Updates. Push')).toBeTruthy();
    expect(screen.getByLabelText('Status Updates. Off')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Approvals. Push'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/notifications/[category]',
      params: { category: 'approvals' },
    });
  });

  it('changes the live Push preference without creating an inert Email preference', () => {
    const screen = render(<NotificationCategoryDetailScreen category="approvals" />);

    expect(screen.getByText('Approvals')).toBeTruthy();
    expect(screen.getByLabelText('Email notifications. Unavailable')).toBeTruthy();
    expect(screen.getByText('No hidden email preference')).toBeTruthy();

    fireEvent(screen.getByRole('switch'), 'valueChange', false);

    expect(useNotificationPrefsStore.getState().categoryEnabled.approvals).toBe(false);
    expect(useNotificationPrefsStore.getState()).not.toHaveProperty('emailEnabled');
  });

  it('rejects an unknown dynamic category without mutating preferences', () => {
    const before = useNotificationPrefsStore.getState().categoryEnabled;
    const screen = render(<NotificationCategoryDetailScreen category="marketing" />);

    expect(screen.getByText('Notification category not found')).toBeTruthy();
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
  });
});
