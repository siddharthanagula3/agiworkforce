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

const mockPaywallBottomSheet = jest.fn(() => null);
jest.mock('@/src/features/chat/components/PaywallBottomSheet', () => ({
  PaywallBottomSheet: (props: Record<string, unknown>) => mockPaywallBottomSheet(props),
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
  return {
    CreditCard: Icon,
    ExternalLink: Icon,
    FileText: Icon,
    Check: Icon,
    RefreshCw: Icon,
    ShoppingBag: Icon,
  };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        <RN.Text>{body}</RN.Text>
      </RN.View>
    ),
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
import { fetchPortalSessionUrl } from '../src/features/billing/service';

describe('Cloud Billing screen, Local-mode-blocked tier refresh (2026-07-05)', () => {
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

  it('keeps free-plan recovery honest instead of routing Billing back to itself', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    render(<CloudBillingScreen />);

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      recoveryAction: 'subscribe',
      onPrimaryAction: undefined,
      primaryActionUnavailableMessage:
        "Plan changes aren't available in the app yet. Check back soon.",
    });
  });

  it('gives an inactive subscriber a real portal action when billing management is enabled', async () => {
    Object.assign(mockFeatures, { billing: true });
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'pro',
      billingStatus: 'past_due',
      billingSource: 'stripe',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    render(<CloudBillingScreen />);

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0];
    expect(props?.recoveryAction).toBe('manage_billing');
    expect(props?.onPrimaryAction).toEqual(expect.any(Function));

    await act(async () => {
      await (props?.onPrimaryAction as () => Promise<void>)();
    });
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/portal');
  });

  it('keeps inactive store-owned recovery at the recorded owner instead of opening Stripe', async () => {
    Object.assign(mockFeatures, { billing: true });
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'pro',
      billingStatus: 'past_due',
      billingSource: 'apple',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    render(<CloudBillingScreen />);

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0];
    expect(props?.recoveryAction).toBe('manage_billing');
    expect(props?.onPrimaryAction).toEqual(expect.any(Function));

    await act(async () => {
      await (props?.onPrimaryAction as () => Promise<void>)();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Subscription managed elsewhere',
      expect.stringContaining('another platform'),
      expect.any(Array),
    );
    expect(fetchPortalSessionUrl).not.toHaveBeenCalled();
    expect(openExternalUrl).not.toHaveBeenCalledWith('https://example.com/portal');
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

  it('always renders the plan badge, never swaps it for an indefinite spinner', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { queryByText } = render(<CloudBillingScreen />);
    expect(queryByText('Chat on web, iOS, Android, and desktop')).toBeTruthy();
  });

  it('shows a canceled recorded plan without granting paid feature status', () => {
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'pro',
      billingStatus: 'canceled',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getAllByText, getByText } = render(<CloudBillingScreen />);

    expect(getByText('Pro plan')).toBeTruthy();
    expect(getAllByText(/Canceled/i).length).toBeGreaterThan(0);
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

  it('shows exact Web proration and founder-set top-up terms for an active Stripe plan', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText, queryByText } = render(<CloudBillingScreen />);

    expect(getByText('How plan upgrades are charged')).toBeTruthy();
    expect(
      getByText(/exact prorated charge for the rest of your current billing period/i),
    ).toBeTruthy();
    expect(getByText('Usage top-ups')).toBeTruthy();
    expect(getByText(/50 units for every \$1/i)).toBeTruthy();
    expect(getByText(/minimum top-up is \$10 \(500 units\)/i)).toBeTruthy();
    expect(getByText(/ordinary self-serve maximum is \$100/i)).toBeTruthy();
    expect(
      getByText(/native store shows the actual localized price and applicable tax/i),
    ).toBeTruthy();
    expect(queryByText(/buy 500 units/i)).toBeNull();
  });

  it('does not advertise Web top-ups to a plan that is not actively billed by Stripe', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'apple',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { queryByText } = render(<CloudBillingScreen />);

    expect(queryByText('How plan upgrades are charged')).toBeNull();
    expect(queryByText('Usage top-ups')).toBeNull();
  });

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
    expect(buttons.map((button) => button.text)).toEqual(['OK']);
    buttons.find((button) => button.text === 'Open subscriptions')?.onPress?.();
    expect(openExternalUrl).not.toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions',
    );
  });
});
