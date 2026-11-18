import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { USAGE_RESET_REMINDER_PATH } from '@agiworkforce/cloud-contracts';

const mockPost = jest.fn();
const mockGetPushDeliveryStatus = jest.fn();
const mockEnablePushNotifications = jest.fn();

jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock('@/services/notifications', () => ({
  getPushDeliveryStatus: () => mockGetPushDeliveryStatus(),
  enablePushNotifications: () => mockEnablePushNotifications(),
}));

import {
  USAGE_RESET_REMINDER_ACTION,
  USAGE_RESET_REMINDER_SET,
  UsageLimitBanner,
  usageResumesAt,
  usageWarningFromSnapshot,
} from '@/src/features/chat/components/UsageLimitBanner';
import { ApiHttpError } from '@/services/apiErrors';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import type { UsageSnapshot } from '@/services/usage';

const OWNER = 'usage-reset-owner';
const HOUR_MS = 60 * 60 * 1000;

function snapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    planTier: 'pro',
    usagePercentage: 0,
    usageResetAt: null,
    hasUsageRemaining: false,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 100,
    sessionResetAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
    weeklyUsagePercentage: 0,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: null,
    limitPromotions: null,
    ...overrides,
  } as UsageSnapshot;
}

function renderBanner(current: UsageSnapshot) {
  act(() => {
    useCloudUsageStore.setState({ ownerId: OWNER, snapshot: current });
  });
  return render(
    <UsageLimitBanner
      warning={usageWarningFromSnapshot(current)}
      actionLabel={null}
      onAction={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
}

describe('notify me when the usage limit resets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPushDeliveryStatus.mockResolvedValue('granted');
    mockEnablePushNotifications.mockResolvedValue('granted');
    mockPost.mockResolvedValue({ remindAt: new Date().toISOString() });
    act(() => {
      useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    });
  });

  afterEach(() => {
    act(() => {
      useCloudUsageStore.setState({ ownerId: null, snapshot: null });
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          ...useNotificationPrefsStore.getState().categoryEnabled,
          usage_resets: true,
        },
      });
      useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false, clerkUserId: null });
    });
  });

  it('asks the server to remind at the reset time, then says it will', async () => {
    const current = snapshot();
    const screen = renderBanner(current);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(mockPost).toHaveBeenCalledWith(USAGE_RESET_REMINDER_PATH, {
      resetAt: new Date(current.sessionResetAt as string).toISOString(),
    });
    expect(screen.getByText(USAGE_RESET_REMINDER_SET)).toBeTruthy();
    expect(screen.queryByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeNull();
  });

  it('shows the message the route gives when it refuses', async () => {
    mockPost.mockRejectedValueOnce(
      new ApiHttpError('Usage reminders are turned off in Notifications settings.', 400),
    );
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(
      screen.getByText('Usage reminders are turned off in Notifications settings.'),
    ).toBeTruthy();
    expect(screen.queryByText(USAGE_RESET_REMINDER_SET)).toBeNull();
    expect(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeTruthy();
  });

  it('turns reset reminders back on for this device once the account accepts one', async () => {
    act(() => {
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          ...useNotificationPrefsStore.getState().categoryEnabled,
          usage_resets: false,
        },
      });
    });
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(useNotificationPrefsStore.getState().categoryEnabled.usage_resets).toBe(true);
    expect(screen.getByText(USAGE_RESET_REMINDER_SET)).toBeTruthy();
  });

  it('leaves this device as it was when the account refuses the reminder', async () => {
    act(() => {
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          ...useNotificationPrefsStore.getState().categoryEnabled,
          usage_resets: false,
        },
      });
    });
    mockPost.mockRejectedValueOnce(
      new ApiHttpError('Usage reminders are turned off in Notifications settings.', 400),
    );
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(useNotificationPrefsStore.getState().categoryEnabled.usage_resets).toBe(false);
  });

  it('does not show a server message that is not meant for people', async () => {
    mockPost.mockRejectedValueOnce(new ApiHttpError('Invalid or missing CSRF token', 403));
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(screen.queryByText('Invalid or missing CSRF token')).toBeNull();
    expect(screen.getByText('The reminder could not be set. Try again in a minute.')).toBeTruthy();
  });

  it('asks the device first, and sends nothing when it blocks notifications', async () => {
    mockGetPushDeliveryStatus.mockResolvedValueOnce('undetermined');
    mockEnablePushNotifications.mockResolvedValueOnce('denied');
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(mockEnablePushNotifications).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText('Notifications are blocked for this app in Settings.')).toBeTruthy();
  });

  it('sends nothing and says so when the person closes the notification prompt', async () => {
    act(() => {
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          ...useNotificationPrefsStore.getState().categoryEnabled,
          usage_resets: false,
        },
      });
    });
    mockGetPushDeliveryStatus.mockResolvedValueOnce('undetermined');
    mockEnablePushNotifications.mockResolvedValueOnce('undetermined');
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(useNotificationPrefsStore.getState().categoryEnabled.usage_resets).toBe(false);
    expect(mockEnablePushNotifications).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Notifications are not allowed yet. Tap again to be asked.'),
    ).toBeTruthy();
    expect(screen.queryByText(USAGE_RESET_REMINDER_SET)).toBeNull();
    expect(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeTruthy();
  });

  it('sends nothing when this device has no push registration', async () => {
    mockGetPushDeliveryStatus.mockResolvedValueOnce('unregistered');
    const screen = renderBanner(snapshot());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION));
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'This device cannot receive notifications right now. Try again in a minute.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeTruthy();
  });

  it('offers nothing while some usage is left', () => {
    const screen = renderBanner(snapshot({ sessionUsagePercentage: 95 }));

    expect(screen.getByTestId('chat.usage-limit')).toBeTruthy();
    expect(screen.queryByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeNull();
  });

  it('offers nothing for another account’s usage', () => {
    act(() => {
      useAuthStore.setState({ clerkUserId: 'someone-else' });
    });
    const screen = renderBanner(snapshot());

    expect(screen.queryByLabelText(USAGE_RESET_REMINDER_ACTION)).toBeNull();
  });

  it('waits for the last spent limit, since an earlier reset does not let messages through', () => {
    const now = Date.now();
    const weeklyResetAt = new Date(now + 3 * 24 * HOUR_MS).toISOString();
    const current = snapshot({ weeklyUsagePercentage: 100, weeklyResetAt });

    expect(usageResumesAt(current, now)).toBe(weeklyResetAt);
    expect(usageResumesAt(snapshot({ weeklyUsagePercentage: 100 }), now)).toBeNull();
    expect(
      usageResumesAt(
        snapshot({ sessionResetAt: new Date(now + 30 * 24 * HOUR_MS).toISOString() }),
        now,
      ),
    ).toBeNull();
  });
});
