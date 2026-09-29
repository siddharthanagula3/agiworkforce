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
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
    SettingsRow: ({
      label,
      value,
      onPress,
    }: {
      label: string;
      value?: string;
      onPress?: () => void;
    }) => (
      <RN.Pressable
        accessibilityLabel={label}
        accessibilityState={{ disabled: !onPress }}
        onPress={onPress}
      >
        <RN.Text>{label}</RN.Text>
        {value ? <RN.Text>{value}</RN.Text> : null}
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
  billingCancelsAtPeriodEnd: false,
  refreshTier: mockRefreshTier,
};
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: typeof mockTierState) => unknown) => selector(mockTierState),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

import CloudBillingScreen from '../src/features/settings/cloud-billing/index';
import * as mobileIapHook from '../src/features/billing/useMobileIap';
import * as mobileIapService from '../src/features/billing/mobileIapService';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { openExternalUrl } from '../lib/safeOpenURL';
import { fetchPortalSessionUrl } from '../src/features/billing/service';
import * as releaseState from '../src/features/release-state';
import { ApiHttpError } from '../services/apiErrors';

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
      billingCancelsAtPeriodEnd: false,
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

  it.each([
    [
      new ApiHttpError(
        'This subscription is billed by Apple. Manage or cancel it with Apple before starting web billing.',
        409,
        'CONFLICT',
      ),
      'Billing managed elsewhere',
      'This subscription is billed by Apple. Manage or cancel it with Apple before starting web billing.',
    ],
    [
      new ApiHttpError('Paid upgrades are opening in stages.', 403, 'waitlist_access_required'),
      'Upgrade access needed',
      'Paid upgrades are opening in stages.',
    ],
    [
      new ApiHttpError('Failed to create portal session', 500, 'INTERNAL_ERROR'),
      'Billing portal unavailable',
      'Please try again later.',
    ],
  ])('says why the billing portal did not open (%#)', async (error, title, message) => {
    Object.assign(mockFeatures, { billing: true });
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'pro',
      billingStatus: 'past_due',
      billingSource: 'stripe',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    (fetchPortalSessionUrl as jest.Mock).mockRejectedValueOnce(error);

    render(<CloudBillingScreen />);

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0];
    await act(async () => {
      await (props?.onPrimaryAction as () => Promise<void>)();
    });
    expect(Alert.alert).toHaveBeenCalledWith(title, message);
    expect(openExternalUrl).not.toHaveBeenCalled();
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
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-billing' },
    });
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
    expect(queryByText('Free plan')).toBeTruthy();
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

  it('shows exact Web proration and sends top-ups to the web for an active Stripe plan', () => {
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
      getByText(
        /new plan's price, minus a credit for the unused time on your current plan\. It starts a new billing period that day/i,
      ),
    ).toBeTruthy();
    expect(getByText('Usage top-ups')).toBeTruthy();
    expect(getByText(/credits are bought on the web, in settings, billing/i)).toBeTruthy();
    expect(queryByText(/minimum top-up/i)).toBeNull();
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

  it('tells a store subscriber that deleting the app does not cancel the plan', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'google',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText } = render(<CloudBillingScreen />);

    expect(getByText('Deleting this app does not cancel your plan')).toBeTruthy();
    expect(
      getByText(
        "Your plan renews through the store you bought it from until you cancel it in that store's subscription settings.",
      ),
    ).toBeTruthy();
  });

  it('points the uninstall line at the store row once the store is published', () => {
    const displayName = jest.spyOn(releaseState, 'storeDisplayName').mockReturnValue('Google Play');
    const managementUrl = jest
      .spyOn(releaseState, 'storeSubscriptionManagementUrl')
      .mockReturnValue('https://play.google.com/store/account/subscriptions');
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'google',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText, getByLabelText } = render(<CloudBillingScreen />);

    expect(
      getByText(
        'Your plan renews through Google Play until you cancel it there. To cancel, tap Manage in Google Play above.',
      ),
    ).toBeTruthy();
    fireEvent.press(getByLabelText('Manage in Google Play'));
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions',
    );
    displayName.mockRestore();
    managementUrl.mockRestore();
  });

  it('keeps the uninstall line off web plans and plans already set to end', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });
    const web = render(<CloudBillingScreen />);
    expect(web.queryByText('Deleting this app does not cancel your plan')).toBeNull();
    web.unmount();

    Object.assign(mockTierState, { billingSource: 'apple', billingCancelsAtPeriodEnd: true });
    const ending = render(<CloudBillingScreen />);
    expect(ending.queryByText('Deleting this app does not cancel your plan')).toBeNull();
  });
});

describe('MOBILE-037, the Upgrade row never fails after the tap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.billing = false;
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'none',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('marks the row unavailable before the tap and says where plans are changed', () => {
    const { getByLabelText, getByText } = render(<CloudBillingScreen />);

    const row = getByLabelText('Upgrade plan');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(getByText('Unavailable in the app')).toBeTruthy();
    expect(getByText('Plan changes are not in this app yet')).toBeTruthy();
  });

  it('does not open a paywall whose only content is an apology', () => {
    const { getByLabelText } = render(<CloudBillingScreen />);

    fireEvent.press(getByLabelText('Upgrade plan'));

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0] as
      Record<string, unknown> | undefined;
    expect(props?.['primaryActionUnavailableMessage']).toBe(
      "Plan changes aren't available in the app yet. Check back soon.",
    );
  });

  it('restores a working Upgrade row once in-app billing is on', () => {
    mockFeatures.billing = true;

    const { getByLabelText, queryByText } = render(<CloudBillingScreen />);

    expect(getByLabelText('Upgrade plan').props.accessibilityState.disabled).toBe(false);
    expect(queryByText('Unavailable in the app')).toBeNull();
    expect(queryByText('Plan changes are not in this app yet')).toBeNull();
  });

  it('offers the waitlist and keeps upgrade API failures out of the screen', async () => {
    const iapSpy = jest.spyOn(mobileIapHook, 'useMobileIap').mockReturnValue({
      connected: false,
      loading: false,
      restoring: false,
      purchasingKey: null,
      catalog: {
        enabled: false,
        platform: 'ios',
        appAccountToken: null,
        products: [],
        unavailableReason: 'Paid upgrades are opening in stages.',
        unavailableCode: 'waitlist_access_required',
      },
      storeProducts: new Map(),
      priceFor: jest.fn(),
      error: null,
      lastResult: null,
      purchase: jest.fn(),
      restore: jest.fn(),
      reload: jest.fn(),
    });
    const joinSpy = jest
      .spyOn(mobileIapService, 'joinBillingUpgradeWaitlist')
      .mockRejectedValue(new Error('Private waitlist route failed at /internal/billing'));
    const redeemSpy = jest
      .spyOn(mobileIapService, 'redeemBillingUpgradeCode')
      .mockRejectedValue(new Error('Private access route failed at /internal/billing'));

    try {
      const screen = render(<CloudBillingScreen />);

      expect(screen.getByLabelText('Join upgrade waitlist').props.accessibilityState.disabled).toBe(
        false,
      );
      expect(screen.getByText('Or enter an access code below')).toBeTruthy();
      expect(screen.queryByText('Plan changes are not in this app yet')).toBeNull();
      await act(async () => fireEvent.press(screen.getByLabelText('Join upgrade waitlist')));
      expect(joinSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Could not join the waitlist. Try again.')).toBeTruthy();

      fireEvent.changeText(screen.getByLabelText('Upgrade access code'), 'AGI2026');
      await act(async () => fireEvent.press(screen.getByLabelText('Unlock upgrades')));
      expect(redeemSpy).toHaveBeenCalledWith('AGI2026');
      expect(screen.getByText('Could not redeem this code. Check it and try again.')).toBeTruthy();
    } finally {
      iapSpy.mockRestore();
      joinSpy.mockRestore();
      redeemSpy.mockRestore();
    }
  });

  it('shows the server reason when an access code is refused', async () => {
    const iapSpy = jest.spyOn(mobileIapHook, 'useMobileIap').mockReturnValue({
      connected: false,
      loading: false,
      restoring: false,
      purchasingKey: null,
      catalog: {
        enabled: false,
        platform: 'ios',
        appAccountToken: null,
        products: [],
        unavailableReason: 'Paid upgrades are opening in stages.',
        unavailableCode: 'waitlist_access_required',
      },
      storeProducts: new Map(),
      priceFor: jest.fn(),
      error: null,
      lastResult: null,
      purchase: jest.fn(),
      restore: jest.fn(),
      reload: jest.fn(),
    });
    const redeemSpy = jest
      .spyOn(mobileIapService, 'redeemBillingUpgradeCode')
      .mockRejectedValue(
        new ApiHttpError('This access code has expired.', 400, 'VALIDATION_ERROR'),
      );

    try {
      const screen = render(<CloudBillingScreen />);

      fireEvent.changeText(screen.getByLabelText('Upgrade access code'), 'AGI2026');
      await act(async () => fireEvent.press(screen.getByLabelText('Unlock upgrades')));
      expect(screen.getByText('This access code has expired.')).toBeTruthy();
    } finally {
      iapSpy.mockRestore();
      redeemSpy.mockRestore();
    }
  });
});
