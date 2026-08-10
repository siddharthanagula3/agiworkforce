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
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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
    CloudAccountRequired: ({
      isLoading,
      onSignIn,
    }: {
      isLoading: boolean;
      onSignIn: () => void;
    }) =>
      isLoading ? (
        <RN.Text>Checking AGI Cloud account…</RN.Text>
      ) : (
        <RN.Pressable accessibilityLabel="Sign in to AGI Cloud" onPress={onSignIn}>
          <RN.Text>Sign in to AGI Cloud</RN.Text>
        </RN.Pressable>
      ),
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));
jest.mock('@/src/features/billing/service', () => ({
  fetchPortalSessionUrl: jest.fn().mockResolvedValue('https://example.com/portal'),
}));
jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { billing: false },
}));
const mockFeatures = jest.requireMock('@/lib/v1FeatureFlags').FEATURES as {
  billing: boolean;
};

const mockRefreshTier = jest.fn().mockResolvedValue(undefined);
const mockTierState = {
  tier: 'free',
  billingTier: 'free',
  billingStatus: 'none',
  billingSource: 'none',
  refreshTier: mockRefreshTier,
};
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: typeof mockTierState) => unknown) => selector(mockTierState),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

import CloudBillingScreen from '../src/features/settings/cloud-billing/index';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { openExternalUrl } from '../lib/safeOpenURL';

describe('Cloud Billing screen — Local-mode-blocked tier refresh (2026-07-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshTier.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    Object.assign(mockFeatures, { billing: false });
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'none',
    });
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
    });
  });

  it('does not expose or fetch billing state while signed out', () => {
    Object.assign(mockAuthState, { isClerkSignedIn: false });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText, queryByText } = render(<CloudBillingScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(queryByText('Free plan')).toBeNull();
    expect(mockRefreshTier).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
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

  it('shows a canceled recorded plan without granting paid feature status', () => {
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'pro',
      billingStatus: 'canceled',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText } = render(<CloudBillingScreen />);

    expect(getByText('Pro plan')).toBeTruthy();
    expect(getByText(/Canceled/i)).toBeTruthy();
  });

  it('does not advertise a billing-management action while mobile billing is disabled', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { queryByText } = render(<CloudBillingScreen />);

    expect(queryByText('Manage billing')).toBeNull();
  });

  it('does not offer Team or Enterprise customers a fake downgrade to Basic', () => {
    Object.assign(mockTierState, {
      tier: 'team',
      billingTier: 'team',
      billingStatus: 'active',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText, queryByText } = render(<CloudBillingScreen />);

    expect(queryByText('Adjust plan')).toBeNull();
    expect(queryByText('Upgrade plan')).toBeNull();
    expect(getByLabelText('Workspace administration')).toBeTruthy();
  });

  it('does not advertise workspace administration for an inactive Team subscription', () => {
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'team',
      billingStatus: 'canceled',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText, queryByText } = render(<CloudBillingScreen />);

    expect(queryByText('Workspace administration')).toBeNull();
    expect(getByLabelText('Choose plan')).toBeTruthy();
  });

  it('hands Team and Enterprise admins to the authenticated web control plane', () => {
    Object.assign(mockTierState, {
      tier: 'enterprise',
      billingTier: 'enterprise',
      billingStatus: 'active',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Workspace administration'));

    expect(openExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/settings/team');
  });

  it('blocks plan changes owned by Web and links to the correct management surface', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Adjust plan'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Subscription managed elsewhere',
      expect.stringContaining('AGI Workforce on the web'),
      expect.any(Array),
    );
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Manage on web')?.onPress?.();
    expect(openExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/settings/billing');
  });

  // CRIT-007: this screen used to tell the user "You purchased this
  // subscription through the Apple App Store" and offer a store link, for an
  // app that has never had an App Store listing. The alert must still block the
  // plan change, but it may not name a store or link to one while the
  // release-state registry has no verified listing.
  it('blocks a store-sourced subscription without claiming a store AGI has no listing on', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'apple',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Adjust plan'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Subscription managed elsewhere',
      expect.stringContaining('another platform'),
      expect.any(Array),
    );
    const message = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[1] as string;
    expect(message).not.toMatch(/apple app store/i);
    expect(message).not.toMatch(/google play/i);

    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    // No store link is offered at all — only the dismiss button.
    expect(buttons.map((button) => button.text)).toEqual(['OK']);
    buttons.find((button) => button.text === 'Open subscriptions')?.onPress?.();
    expect(openExternalUrl).not.toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions',
    );
  });
});
