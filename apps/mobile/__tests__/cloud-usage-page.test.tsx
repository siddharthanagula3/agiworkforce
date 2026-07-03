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
  return { BarChart3: Icon, RefreshCw: Icon, ChevronDown: Icon, ChevronUp: Icon };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));

const mockFetchUsageSnapshot = jest.fn();
jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { billing: true } }));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';

describe('Cloud Usage screen — percentage-first (Claude-style), real endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
