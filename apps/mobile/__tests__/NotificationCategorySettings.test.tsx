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

const mockFeatures = { companion: false };
jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return {
    ...actual,
    FEATURES: new Proxy(actual.FEATURES, {
      get: (target, key) => (key === 'companion' ? mockFeatures.companion : target[key]),
    }),
  };
});

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
    Code2: icon,
    CloudOff: icon,
    Gauge: icon,
    Info: icon,
    Mail: icon,
    MessageSquare: icon,
    Moon: icon,
    Sparkles: icon,
    Sunrise: icon,
    Telescope: icon,
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
  beforeAll(async () => {
    await useNotificationPrefsStore.persist.rehydrate();
  });

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
          research: true,
          code: true,
          product: false,
          usage_resets: true,
        },
        announcedPushGroups: [],
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
    expect(screen.queryByLabelText('Service status. Off')).toBeNull();
    expect(screen.queryByText('Service status')).toBeNull();
    fireEvent.press(screen.getByLabelText('Task and approval updates. Push'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/notifications/[category]',
      params: { category: 'tasks' },
    });
  });

  it('lists research and AGI Code only after this device has received their notices', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    await screen.findByText('Your device is delivering notifications');

    expect(screen.queryByText('Research complete')).toBeNull();
    expect(screen.queryByText('AGI Code')).toBeNull();

    act(() => {
      useNotificationPrefsStore.getState().notePushTypeReceived('research_completed');
    });

    expect(screen.getByText('When a research report is ready')).toBeTruthy();
    expect(screen.queryByText('AGI Code')).toBeNull();

    act(() => {
      useNotificationPrefsStore.getState().setCategoryEnabled('tasks', false);
      useNotificationPrefsStore.getState().notePushTypeReceived('code_session_completed');
    });

    expect(screen.getByLabelText('Research complete. Push')).toBeTruthy();
    expect(screen.getByLabelText('AGI Code. Off')).toBeTruthy();
    expect(screen.getByText('When a coding session finishes or needs you')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('AGI Code. Off'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/notifications/[category]',
      params: { category: 'code' },
    });
  });

  it.each(['research', 'code'])(
    'has no switch page for %s before this device has received its notices',
    (category) => {
      const before = useNotificationPrefsStore.getState().categoryEnabled;
      const screen = render(<NotificationCategoryDetailScreen category={category} />);

      expect(screen.getByText('Notification category not found')).toBeTruthy();
      expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
    },
  );

  it('turns research notices off on their own, leaving task and approval updates on', () => {
    act(() => {
      useNotificationPrefsStore.getState().notePushTypeReceived('research_completed');
    });
    const screen = render(<NotificationCategoryDetailScreen category="research" />);

    expect(screen.getByText('Research complete')).toBeTruthy();
    fireEvent(screen.getByRole('switch'), 'valueChange', false);

    expect(useNotificationPrefsStore.getState().categoryEnabled.research).toBe(false);
    expect(useNotificationPrefsStore.getState().categoryEnabled.tasks).toBe(true);
  });

  it('opens the list of recent notifications, which no longer has a side panel row', async () => {
    mockUnreadCount = 3;
    const screen = render(<NotificationPreferencesScreen />);

    fireEvent.press(await screen.findByLabelText('Recent notifications. 3 unread'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/notifications');
    mockUnreadCount = 0;
  });

  it('shows quiet hours as one row that opens Time and focus', async () => {
    const screen = render(<NotificationPreferencesScreen />);
    await screen.findByText('Your device is delivering notifications');

    expect(screen.getByLabelText('Quiet hours. Off')).toBeTruthy();
    expect(screen.queryByLabelText('Enable Quiet Hours')).toBeNull();
    expect(screen.queryByText('Break Reminder')).toBeNull();
    expect(screen.queryByLabelText(/^Break reminder/)).toBeNull();

    act(() => {
      useNotificationPrefsStore.setState({
        quietHours: { ...useNotificationPrefsStore.getState().quietHours, enabled: true },
      });
    });
    expect(screen.getByLabelText('Quiet hours. On')).toBeTruthy();
    expect(screen.queryByLabelText('Monday quiet hours')).toBeNull();

    fireEvent.press(screen.getByLabelText('Quiet hours. On'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/time-and-focus');
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
    expect(screen.getAllByText('Blocked')).toHaveLength(4);
    expect(
      await screen.findByText(
        'Saved, but this device stays silent until notifications are allowed.',
      ),
    ).toBeTruthy();
  });

  it('lists Service status only once the companion that sends it is available', async () => {
    mockFeatures.companion = true;
    try {
      const screen = render(<NotificationPreferencesScreen />);
      await screen.findByText('Your device is delivering notifications');
      expect(screen.getByLabelText('Service status. Off')).toBeTruthy();
    } finally {
      mockFeatures.companion = false;
    }
  });

  it.each(['product', 'status', 'usage_resets'])(
    'has no device switch page for %s while nothing on this device can control it',
    (category) => {
      const before = useNotificationPrefsStore.getState().categoryEnabled;
      const screen = render(<NotificationCategoryDetailScreen category={category} />);

      expect(screen.getByText('Notification category not found')).toBeTruthy();
      expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
    },
  );

  it('does not mention a paired companion while the companion is hidden', () => {
    const screen = render(<NotificationCategoryDetailScreen category="tasks" />);

    expect(screen.getByText('Push to this device.')).toBeTruthy();
    expect(screen.queryByText(/companion/i)).toBeNull();
  });

  it('mentions a paired companion once the companion is available', () => {
    mockFeatures.companion = true;
    try {
      const screen = render(<NotificationCategoryDetailScreen category="tasks" />);
      expect(screen.getByText('Push to this device or a paired companion.')).toBeTruthy();
    } finally {
      mockFeatures.companion = false;
    }
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
    mockFeatures.companion = current === 'product';
    try {
      const screen = render(<NotificationCategoryDetailScreen category={legacy} />);

      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByText('Notification category not found')).toBeNull();

      fireEvent(screen.getByRole('switch'), 'valueChange', current === 'product');

      expect(useNotificationPrefsStore.getState().categoryEnabled[current]).toBe(
        current === 'product',
      );
      expect(useNotificationPrefsStore.getState().categoryEnabled).not.toHaveProperty(legacy);
    } finally {
      mockFeatures.companion = false;
    }
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

  describe('a category that is on while the device cannot deliver it', () => {
    const notifications = () =>
      require('@/services/notifications') as {
        enablePushNotifications: jest.Mock;
        getPushDeliveryStatus: jest.Mock;
      };

    it('says the device has not been asked and asks only when the person chooses to', async () => {
      notifications().getPushDeliveryStatus.mockResolvedValueOnce('undetermined');
      notifications().enablePushNotifications.mockResolvedValueOnce('granted');
      const screen = render(<NotificationCategoryDetailScreen category="tasks" />);

      expect(
        await screen.findByText('Notifications are not turned on for this device yet.'),
      ).toBeTruthy();
      expect(notifications().enablePushNotifications).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Turn on notifications'));
      });

      expect(notifications().enablePushNotifications).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Notifications are not turned on for this device yet.')).toBeNull();
      expect(screen.queryByLabelText('Turn on notifications')).toBeNull();
    });

    it('sends a device that blocks notifications to Settings instead of asking', async () => {
      const { Linking } = require('react-native');
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      notifications().getPushDeliveryStatus.mockResolvedValueOnce('denied');
      const screen = render(<NotificationCategoryDetailScreen category="tasks" />);

      expect(await screen.findByText('This device is blocking notifications.')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Open Settings'));
      });

      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(notifications().enablePushNotifications).not.toHaveBeenCalled();
      openSettings.mockRestore();
    });

    it('says nothing about the device for a category that is off', async () => {
      notifications().getPushDeliveryStatus.mockResolvedValueOnce('undetermined');
      const screen = render(<NotificationCategoryDetailScreen category="product_updates" />);

      await act(async () => {});

      expect(screen.queryByText('Notifications are not turned on for this device yet.')).toBeNull();
      expect(screen.queryByLabelText('Turn on notifications')).toBeNull();
    });
  });

  it('rejects an unknown dynamic category without mutating preferences', () => {
    const before = useNotificationPrefsStore.getState().categoryEnabled;
    const screen = render(<NotificationCategoryDetailScreen category="marketing" />);

    expect(screen.getByText('Notification category not found')).toBeTruthy();
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(before);
  });
});
