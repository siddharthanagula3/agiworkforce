/**
 * Regression: the Cloud Usage settings screen previously fetched a
 * non-existent endpoint (`/api/usage/summary` — apps/web has no such route,
 * only `/api/usage`) and, even when data was mocked, showed raw dollar
 * figures (`$X.XX`) as the primary metric with a percentage computed from an
 * arbitrary heuristic (`totalCost / (maxModelCost * 10)`) unrelated to the
 * user's actual plan allowance. Fixed to call the real `/api/usage` endpoint
 * (which already returns a real `usage_percentage` from
 * credits_used/credits_allocated) and to show percentage-first as the
 * primary metric — matching the Claude-style reference pattern (a bar,
 * "X% used", "Resets <date>") — with raw dollar figures moved into a
 * collapsed "Details" section, never the headline number.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return {
    BarChart3: Icon,
    RefreshCw: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
    CloudOff: Icon,
  };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
    CloudSyncBlockedBanner: ({ onSwitchToCloud }: { onSwitchToCloud: () => void }) => (
      <RN.Pressable accessibilityLabel="Switch to AGI Cloud" onPress={onSwitchToCloud}>
        <RN.Text>Chat is set to Local Mode</RN.Text>
      </RN.Pressable>
    ),
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));

const mockFetchUsageSnapshot = jest.fn();
jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { usageDashboard: true } }));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

describe('Cloud Usage screen — percentage-first (Claude-style), real endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Existing tests below exercise the "already in Cloud mode" data-loading
    // path; the Local-mode-blocked banner has its own describe block further
    // down.
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows usage as a percentage, not a raw dollar figure, on the primary card', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'pro',
      creditsAllocatedCents: 1000,
      creditsUsedCents: 250,
      creditsRemainingCents: 750,
      usagePercentage: 25,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      dailyUsedCents: 0,
      dailyLimitCents: 0,
      dailyRemainingCents: 0,
      hasDailyLimit: false,
      subscriptionStatus: 'active',
    });

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(getByText('Pro plan')).toBeTruthy();
    // The old primary-card raw dollar figure must not appear before "Details" is opened.
    expect(queryByText('$10.00')).toBeNull();
    expect(queryByText('$2.50')).toBeNull();
  });

  it('reveals exact dollar figures only inside the collapsed Details section', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'basic',
      creditsAllocatedCents: 200,
      creditsUsedCents: 50,
      creditsRemainingCents: 150,
      usagePercentage: 25,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      dailyUsedCents: 0,
      dailyLimitCents: 0,
      dailyRemainingCents: 0,
      hasDailyLimit: false,
      subscriptionStatus: 'active',
    });

    const { getByLabelText, getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(queryByText('$2.00')).toBeNull();

    fireEvent.press(getByLabelText('Show usage details'));

    await waitFor(() => {
      expect(getByText('$2.00')).toBeTruthy();
    });
    expect(getByText('$0.50')).toBeTruthy();
  });

  it('shows the daily budget bar (not the monthly one) for free-tier users with a daily limit', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'free',
      creditsAllocatedCents: 0,
      creditsUsedCents: 0,
      creditsRemainingCents: 0,
      usagePercentage: 0,
      periodStart: null,
      periodEnd: null,
      dailyUsedCents: 0.3,
      dailyLimitCents: 0.5,
      dailyRemainingCents: 0.2,
      hasDailyLimit: true,
      subscriptionStatus: 'none',
    });

    const { getByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Today')).toBeTruthy();
    });
    expect(getByText('Resets tomorrow')).toBeTruthy();
  });
});

describe('Cloud Usage screen — session (rolling 5h) + weekly limits (2026-07-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows Current session and Weekly limits (All models + Flagship models) for a paid tier', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'pro',
      creditsAllocatedCents: 1000,
      creditsUsedCents: 250,
      creditsRemainingCents: 750,
      usagePercentage: 25,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      dailyUsedCents: 0,
      dailyLimitCents: 0,
      dailyRemainingCents: 0,
      hasDailyLimit: false,
      subscriptionStatus: 'active',
      sessionUsedCents: 20,
      sessionCapCents: 46,
      sessionResetAt: new Date(Date.now() + 3 * 60 * 60 * 1000 + 27 * 60 * 1000).toISOString(),
      weeklyUsedCents: 196,
      weeklyCapCents: 231,
      weeklyResetAt: '2026-07-08T18:00:00.000Z',
      flagshipWeeklyUsedCents: 20,
      flagshipWeeklyCapCents: 69,
      flagshipWeeklyResetAt: '2026-07-08T18:00:00.000Z',
    });

    const { getByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Current session')).toBeTruthy();
    });
    // 20/46 rounds to 43% used.
    expect(getByText('43% used')).toBeTruthy();
    expect(getByText(/Resets in 3 hr/)).toBeTruthy();

    expect(getByText('Weekly limits')).toBeTruthy();
    expect(getByText('All models')).toBeTruthy();
    expect(getByText('Flagship models')).toBeTruthy();
    // 196/231 rounds to 85% used, 20/69 rounds to 29% used (matches the
    // Claude reference numbers this feature was modeled on).
    expect(getByText('85% used')).toBeTruthy();
    expect(getByText('29% used')).toBeTruthy();
  });

  it('hides Current session and Weekly limits entirely when caps are 0 (free tier)', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'free',
      creditsAllocatedCents: 0,
      creditsUsedCents: 0,
      creditsRemainingCents: 0,
      usagePercentage: 0,
      periodStart: null,
      periodEnd: null,
      dailyUsedCents: 0.3,
      dailyLimitCents: 0.5,
      dailyRemainingCents: 0.2,
      hasDailyLimit: true,
      subscriptionStatus: 'none',
      sessionUsedCents: 0,
      sessionCapCents: 0,
      sessionResetAt: null,
      weeklyUsedCents: 0,
      weeklyCapCents: 0,
      weeklyResetAt: null,
      flagshipWeeklyUsedCents: 0,
      flagshipWeeklyCapCents: 0,
      flagshipWeeklyResetAt: null,
    });

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Today')).toBeTruthy();
    });
    expect(queryByText('Current session')).toBeNull();
    expect(queryByText('Weekly limits')).toBeNull();
  });
});

describe('Cloud Usage screen — blocked by Local Mode (2026-07-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('shows the Local Mode banner instead of fetching, and never calls fetchUsageSnapshot', async () => {
    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
    expect(queryByText('% used')).toBeNull();
  });

  it('fetches usage as soon as the user switches to Cloud mode via the banner', async () => {
    mockFetchUsageSnapshot.mockResolvedValue({
      planTier: 'pro',
      creditsAllocatedCents: 1000,
      creditsUsedCents: 250,
      creditsRemainingCents: 750,
      usagePercentage: 25,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      dailyUsedCents: 0,
      dailyLimitCents: 0,
      dailyRemainingCents: 0,
      hasDailyLimit: false,
      subscriptionStatus: 'active',
      sessionUsedCents: 0,
      sessionCapCents: 0,
      sessionResetAt: null,
      weeklyUsedCents: 0,
      weeklyCapCents: 0,
      weeklyResetAt: null,
      flagshipWeeklyUsedCents: 0,
      flagshipWeeklyCapCents: 0,
      flagshipWeeklyResetAt: null,
    });

    const { getByText, getByLabelText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Switch to AGI Cloud'));

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(queryByText('Chat is set to Local Mode')).toBeNull();
    expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(1);
  });
});
