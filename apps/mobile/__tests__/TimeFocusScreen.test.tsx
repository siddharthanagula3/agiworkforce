/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { BREAK_REMINDER_MINUTES } from '@agiworkforce/types';

const mockSavePreferenceNamespace = jest.fn();
const mockFetchPreferenceNamespace = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreferenceNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mockSavePreferenceNamespace(...args),
  patchPreferenceNamespace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        const Icon = () => <Text>{`icon-${name}`}</Text>;
        return Icon;
      },
    },
  );
});

import TimeFocusScreen from '@/src/features/settings/notifications/TimeFocusScreen';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const originalOS = Platform.OS;
const BREAK_CHOICE_LABELS = ['Off', '30 minutes', '1 hour', '2 hours', '4 hours'];
const SAVE_DEBOUNCE_MS = 600;
const QUIET_HOURS_OFF = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  startTime: '22:00',
  endTime: '08:00',
  timezone: 'UTC',
};
const QUIET_HOURS_ON = { ...QUIET_HOURS_OFF, enabled: true };

function storeQuietHours(quietHours: typeof QUIET_HOURS_OFF) {
  act(() => {
    useNotificationPrefsStore.setState({ quietHours });
  });
  mockFetchPreferenceNamespace.mockResolvedValue({ breakReminderMinutes: null, quietHours });
}

function chooseBreakReminder(screen: ReturnType<typeof render>, label: string) {
  fireEvent.press(within(screen.getByTestId('chat-actions-sheet')).getByLabelText(label));
  act(() => {
    jest.advanceTimersByTime(1);
  });
}

function signInToCloud() {
  activateCloudAccount('time-focus-owner');
  act(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'time-focus-owner',
    });
  });
}

async function renderScreen() {
  const screen = render(<TimeFocusScreen />);
  await act(async () => {});
  return screen;
}

describe('Time and focus screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSavePreferenceNamespace.mockReset().mockResolvedValue(undefined);
    mockFetchPreferenceNamespace.mockReset().mockResolvedValue({});
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    __resetCloudAccountSessionForTests();
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkSignedIn: false, isClerkLoaded: false, clerkUserId: null });
      useNotificationPrefsStore.setState({
        breakReminderMinutes: null,
        quietHours: QUIET_HOURS_OFF,
      });
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  it('lists the break reminder times in a dropdown with a check on the current one', async () => {
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 60 });
    });
    const screen = await renderScreen();

    expect(screen.getByText('Break reminders')).toBeTruthy();
    expect(screen.getByText('Get a nudge to take a break from AGI.')).toBeTruthy();
    const dropdown = screen.getByLabelText('Break reminders. After 1 hr');
    expect(screen.queryByTestId('chat-actions-sheet')).toBeNull();

    fireEvent.press(dropdown);

    const sheet = screen.getByTestId('chat-actions-sheet');
    const options = BREAK_CHOICE_LABELS.map((label) => within(sheet).getByLabelText(label));
    expect(options).toHaveLength(BREAK_REMINDER_MINUTES.length + 1);
    expect(within(sheet).getByLabelText('1 hour').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(within(sheet).getByLabelText('Off').props.accessibilityState).toMatchObject({
      selected: undefined,
    });
  });

  it('saves the chosen time, closes the dropdown and syncs it to the account', async () => {
    signInToCloud();
    const screen = await renderScreen();
    expect(screen.getByText('Synced with web and desktop.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Break reminders. Off'));
    chooseBreakReminder(screen, '2 hours');

    expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(120);
    expect(screen.getByLabelText('Break reminders. After 2 hr')).toBeTruthy();
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(mockSavePreferenceNamespace).toHaveBeenCalledTimes(1);
    expect(mockSavePreferenceNamespace.mock.calls[0]?.[1]).toMatchObject({
      breakReminderMinutes: 120,
    });
    expect(screen.getByText('Synced with web and desktop.')).toBeTruthy();
  });

  it('switches the reminder off again from the dropdown', async () => {
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
    });
    const screen = await renderScreen();

    fireEvent.press(screen.getByLabelText('Break reminders. After 30 min'));
    chooseBreakReminder(screen, 'Off');

    expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBeNull();
    expect(screen.getByLabelText('Break reminders. Off')).toBeTruthy();
  });

  it('describes the reminder as one nudge a day, not a repeating interval', async () => {
    act(() => {
      useNotificationPrefsStore.setState({ breakReminderMinutes: 30 });
    });
    const screen = await renderScreen();

    expect(
      screen.getByLabelText('Break reminders. After 30 min').props.accessibilityHint,
    ).toContain('One nudge each day');
    expect(screen.queryByText(/^Every /)).toBeNull();
  });

  it('keeps the status line under the Break reminders control, above Quiet hours', async () => {
    const screen = await renderScreen();

    const tree = JSON.stringify(screen.toJSON());
    const breakControl = tree.indexOf('time-focus.break-reminders');
    const status = tree.indexOf('time-focus.sync-status');
    const quietHours = tree.indexOf('time-focus.quiet-hours-switch');
    expect(breakControl).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(breakControl);
    expect(quietHours).toBeGreaterThan(status);
    expect(screen.getAllByTestId('time-focus.sync-status')).toHaveLength(1);
  });

  it('says in Local Mode that the settings stay on this device', async () => {
    const screen = await renderScreen();

    expect(
      screen.getByText('Saved on this device. Use AGI Cloud to share with web and desktop.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Break reminders. Off'));
    chooseBreakReminder(screen, '4 hours');
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(useNotificationPrefsStore.getState().breakReminderMinutes).toBe(240);
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('shows the error when the account save fails', async () => {
    storeQuietHours(QUIET_HOURS_OFF);
    signInToCloud();
    mockSavePreferenceNamespace.mockRejectedValue(new Error('offline'));
    const screen = await renderScreen();

    fireEvent(screen.getByTestId('time-focus.quiet-hours-switch'), 'valueChange', true);
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(
      screen.getByText(
        'Could not save time and focus settings. Check your connection and try again.',
      ),
    ).toBeTruthy();
  });

  describe('quiet hours', () => {
    it('keeps the days, times and note out of view until quiet hours are on', async () => {
      const screen = await renderScreen();

      expect(screen.getByText('Quiet hours')).toBeTruthy();
      expect(screen.queryByLabelText('Monday quiet hours')).toBeNull();
      expect(screen.queryByLabelText(/^Start time/)).toBeNull();
      expect(
        screen.queryByText(
          'Agent failures, emergency stops and approval requests still come through.',
        ),
      ).toBeNull();
    });

    it('turns on, shows the days, times and the note, and syncs the change', async () => {
      storeQuietHours(QUIET_HOURS_OFF);
      signInToCloud();
      const screen = await renderScreen();

      fireEvent(screen.getByTestId('time-focus.quiet-hours-switch'), 'valueChange', true);

      expect(useNotificationPrefsStore.getState().quietHours.enabled).toBe(true);
      expect(screen.getByLabelText('Monday quiet hours').props.accessibilityState).toMatchObject({
        checked: true,
      });
      expect(screen.getByLabelText('Sunday quiet hours').props.accessibilityState).toMatchObject({
        checked: false,
      });
      expect(screen.getByLabelText('Start time. 22:00')).toBeTruthy();
      expect(screen.getByLabelText('End time. 08:00')).toBeTruthy();
      expect(
        screen.getByText(
          'Agent failures, emergency stops and approval requests still come through.',
        ),
      ).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });

      expect(mockSavePreferenceNamespace).toHaveBeenCalledTimes(1);
      expect(mockSavePreferenceNamespace.mock.calls[0]?.[1]).toMatchObject({
        quietHours: { enabled: true },
      });
    });

    it('toggles a day and warns when none is left', async () => {
      storeQuietHours({ ...QUIET_HOURS_ON, days: [0] });
      const screen = await renderScreen();

      fireEvent.press(screen.getByLabelText('Wednesday quiet hours'));
      expect(useNotificationPrefsStore.getState().quietHours.days).toEqual([0, 3]);

      fireEvent.press(screen.getByLabelText('Sunday quiet hours'));
      fireEvent.press(screen.getByLabelText('Wednesday quiet hours'));
      expect(useNotificationPrefsStore.getState().quietHours.days).toEqual([]);
      expect(screen.getByText('Pick at least one day, or quiet hours stay off.')).toBeTruthy();
    });

    it('gives every day circle a tap area of at least 44 points', async () => {
      storeQuietHours(QUIET_HOURS_ON);
      const screen = await renderScreen();

      const day = screen.getByTestId('time-focus.day-3');
      const style = StyleSheet.flatten(day.props.style);
      const slop = day.props.hitSlop;
      expect(style.width + slop.left + slop.right).toBeGreaterThanOrEqual(44);
      expect(style.height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    });

    it('sets the start and end time from the time picker and syncs them', async () => {
      storeQuietHours(QUIET_HOURS_ON);
      signInToCloud();
      const screen = await renderScreen();

      fireEvent.press(screen.getByLabelText('Start time. 22:00'));
      fireEvent.press(screen.getByLabelText('Set time to 23:00'));
      fireEvent.press(screen.getByLabelText('Set Time'));
      expect(useNotificationPrefsStore.getState().quietHours.startTime).toBe('23:00');

      fireEvent.press(screen.getByLabelText('End time. 08:00'));
      fireEvent.press(screen.getByLabelText('Set time to 07:00'));
      fireEvent.press(screen.getByLabelText('Set Time'));
      expect(useNotificationPrefsStore.getState().quietHours.endTime).toBe('07:00');

      await act(async () => {
        jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });

      expect(mockSavePreferenceNamespace).toHaveBeenCalledTimes(1);
      expect(mockSavePreferenceNamespace.mock.calls[0]?.[1]).toMatchObject({
        quietHours: { startTime: '23:00', endTime: '07:00' },
      });
    });
  });
});
