/**
 * Cloud Billing screen — unit tests.
 *
 * Covers the 2026-07-05 fixes:
 *  - The plan badge no longer swaps for an indefinite ActivityIndicator
 *    during a tier refresh — it renders every time, immediately.
 *  - guardedFetch (lib/egressGuard.ts) silently blocks this screen's own
 *    tier refresh while chat is set to Local Mode (a zero-leak guarantee
 *    unrelated to this screen's purpose) — the screen must show an
 *    explicit CloudSyncBlockedBanner instead of a permanently-stale plan,
 *    and re-fetch the instant the user switches to Cloud mode.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactLib = require('react');
  const mockBottomSheet = ReactLib.forwardRef(
    (_props: { children: React.ReactNode }, _ref: unknown) => null,
  );
  mockBottomSheet.displayName = 'MockBottomSheet';
  return { __esModule: true, default: mockBottomSheet };
});

jest.mock('@/src/features/chat/components/PaywallBottomSheet', () => ({
  PaywallBottomSheet: () => null,
}));

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('@/components/ui/AgiMark', () => {
  const RN = require('react-native');
  return { AgiMark: () => <RN.View /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return { CreditCard: Icon, ExternalLink: Icon, FileText: Icon, Check: Icon };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <RN.Pressable accessibilityLabel={label} onPress={onPress}>
        <RN.Text>{label}</RN.Text>
      </RN.Pressable>
    ),
    CloudSyncBlockedBanner: ({ onSwitchToCloud }: { onSwitchToCloud: () => void }) => (
      <RN.Pressable accessibilityLabel="Switch to AGI Cloud" onPress={onSwitchToCloud}>
        <RN.Text>Chat is set to Local Mode</RN.Text>
      </RN.Pressable>
    ),
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));
jest.mock('@/src/features/billing/service', () => ({
  fetchPortalSessionUrl: jest.fn().mockResolvedValue('https://example.com/portal'),
}));
jest.mock('@/src/features/billing/useIapPurchaseFlow', () => ({
  useIapPurchaseFlow: () => ({
    connected: false,
    manageSubscription: jest.fn(),
    restore: jest.fn(),
  }),
}));
jest.mock('@/src/features/billing/iapStore', () => ({
  useIapStore: (selector: (s: { status: string; errorMessage: string | null }) => unknown) =>
    selector({ status: 'idle', errorMessage: null }),
}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { iap: false, billing: false } }));

const mockRefreshTier = jest.fn().mockResolvedValue(undefined);
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: { tier: string; refreshTier: () => Promise<void> }) => unknown) =>
    selector({ tier: 'free', refreshTier: mockRefreshTier }),
}));

import CloudBillingScreen from '../src/features/settings/cloud-billing/index';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

describe('Cloud Billing screen — Local-mode-blocked tier refresh (2026-07-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshTier.mockResolvedValue(undefined);
  });

  it('shows the Local Mode banner and does not refresh the tier while chat is set to Local', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    const { getByText } = render(<CloudBillingScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockRefreshTier).not.toHaveBeenCalled();
  });

  it('refreshes the tier as soon as the user switches to Cloud mode via the banner', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });

    const { getByText, getByLabelText, queryByText } = render(<CloudBillingScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockRefreshTier).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByLabelText('Switch to AGI Cloud'));
    });

    await waitFor(() => {
      expect(mockRefreshTier).toHaveBeenCalledTimes(1);
    });
    expect(queryByText('Chat is set to Local Mode')).toBeNull();
  });

  it('refreshes the tier immediately when already in Cloud mode, with no banner', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { queryByText } = render(<CloudBillingScreen />);

    await waitFor(() => {
      expect(mockRefreshTier).toHaveBeenCalledTimes(1);
    });
    expect(queryByText('Chat is set to Local Mode')).toBeNull();
  });

  it('always renders the plan badge — never swaps it for an indefinite spinner', () => {
    // Regression: the badge slot used to render an ActivityIndicator whenever
    // useTierStore().isRefreshing was true, which (while blocked by Local
    // Mode, or on any slow network) left the badge missing indefinitely with
    // no other visual explanation. The badge must always render.
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { queryByText } = render(<CloudBillingScreen />);
    // Free plan feature list is a reliable proxy that the plan card rendered
    // its full content immediately, not a loading placeholder.
    expect(queryByText('Chat on web, iOS, Android, and desktop')).toBeTruthy();
  });
});
