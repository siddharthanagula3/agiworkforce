/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, type MobileIapCatalogResponse } from '@agiworkforce/types';

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
let mockWebBillingLinksAllowed = true;
jest.mock('@/src/features/billing/webBillingLinks', () => ({
  useWebBillingLinksAllowed: () => mockWebBillingLinksAllowed,
}));
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
    mockWebBillingLinksAllowed = true;
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
      primaryActionUnavailableMessage: "Plan changes aren't available in this app right now.",
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

  it('says a web-billed plan is managed where it was started, without sending anyone to buy on the web', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText, queryByText } = render(<CloudBillingScreen />);

    expect(getByText('This plan is billed outside the app')).toBeTruthy();
    expect(queryByText(/bought on the web/i)).toBeNull();
    expect(queryByText(/agiworkforce\.com/i)).toBeNull();
    expect(queryByText('How plan upgrades are charged')).toBeNull();
    expect(queryByText(/minimum top-up/i)).toBeNull();
  });

  it('keeps the outside-the-app line off a plan the store bills', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'apple',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { queryByText } = render(<CloudBillingScreen />);

    expect(queryByText('This plan is billed outside the app')).toBeNull();
    expect(queryByText('Usage top-ups')).toBeNull();
  });

  it('offers invoices only for a plan billed on the web', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'apple',
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const store = render(<CloudBillingScreen />);
    expect(store.queryByText('View invoices')).toBeNull();
    store.unmount();

    Object.assign(mockTierState, { billingSource: 'stripe' });
    const web = render(<CloudBillingScreen />);
    expect(web.getByText('View invoices')).toBeTruthy();
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

const APP_ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000001';
const storeProductId = (key: string) => `fixture.${key}`;
const catalogProducts = MOBILE_IAP_PRODUCT_DEFINITIONS.map((definition) => ({
  ...definition,
  productId: storeProductId(definition.key),
}));

function disabledCatalog(): MobileIapCatalogResponse {
  return {
    enabled: false,
    platform: 'ios',
    appAccountToken: null,
    products: [],
    unavailableReason: 'App Store products have not been registered for this build.',
  };
}

function sellingCatalog(
  overrides: Partial<MobileIapCatalogResponse> = {},
): MobileIapCatalogResponse {
  return {
    enabled: true,
    platform: 'ios',
    appAccountToken: APP_ACCOUNT_TOKEN,
    products: catalogProducts,
    unavailableReason: null,
    ...overrides,
  };
}

function iapState(
  overrides: Partial<ReturnType<typeof mobileIapHook.useMobileIap>> = {},
): ReturnType<typeof mobileIapHook.useMobileIap> {
  return {
    connected: true,
    loading: false,
    restoring: false,
    purchasingKey: null,
    catalog: sellingCatalog(),
    storeProducts: new Map(
      catalogProducts.map((product) => [product.productId, { id: product.productId } as never]),
    ),
    priceFor: (key) => ({ label: `price:${key}`, currency: 'USD', offerToken: null }),
    error: null,
    lastResult: null,
    awaitingApproval: new Set(),
    scheduledProductKey: null,
    purchase: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn(),
    reload: jest.fn(),
    ...overrides,
  };
}

describe('buying and changing plans in the app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.billing = false;
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'none',
      billingCancelsAtPeriodEnd: false,
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  function renderWith(state: ReturnType<typeof iapState>) {
    const iapSpy = jest.spyOn(mobileIapHook, 'useMobileIap').mockReturnValue(state);
    const screen = render(<CloudBillingScreen />);
    iapSpy.mockRestore();
    return screen;
  }

  function holdStorePlan(billingTier: string) {
    Object.assign(mockTierState, {
      tier: billingTier,
      billingTier,
      billingStatus: 'active',
      billingSource: 'apple',
    });
  }

  it("sells every plan the catalog returns at the store's own price", () => {
    const state = iapState();
    const screen = renderWith(state);

    for (const label of ['Basic', 'Pro', 'Max 5x', 'Max 20x']) {
      expect(screen.getByLabelText(`${label} · monthly`)).toBeTruthy();
    }
    expect(screen.getByText('price:subscription_pro_monthly')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pro · monthly'));
    expect(state.purchase).toHaveBeenCalledWith('subscription_pro_monthly');
  });

  it('states auto-renewal and links Terms and Privacy wherever a plan can be bought', () => {
    const screen = renderWith(iapState());

    expect(screen.getByText(/Cancel at least 24 hours before renewal/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Terms of Use'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/terms');
    fireEvent.press(screen.getByLabelText('Privacy Policy'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/privacy');
  });

  it('describes Google Play renewal and cancellation to an Android buyer', () => {
    const screen = renderWith(iapState({ catalog: sellingCatalog({ platform: 'android' }) }));

    expect(screen.getByText(/Cancel any time in Google Play/)).toBeTruthy();
    expect(screen.queryByText(/24 hours/)).toBeNull();
  });

  it('shows no renewal terms when no plan can be bought', () => {
    const screen = renderWith(iapState({ catalog: disabledCatalog() }));

    expect(screen.queryByText('Auto-renews')).toBeNull();
    expect(screen.queryByLabelText('Terms of Use')).toBeNull();
  });

  it('never shows a plan price that did not come from the store', () => {
    const screen = renderWith(
      iapState({ priceFor: () => ({ label: null, currency: null, offerToken: null }) }),
    );

    const row = screen.getByLabelText('Pro · monthly');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText(/\$\s?\d/)).toBeNull();
  });

  it('marks the current plan and labels each other plan as an upgrade or a downgrade', () => {
    holdStorePlan('pro');
    const state = iapState();
    const screen = renderWith(state);

    expect(screen.getByLabelText('Pro · monthly').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Current plan')).toBeTruthy();
    expect(screen.getByText('Downgrade · price:subscription_basic_monthly')).toBeTruthy();
    expect(screen.getByText('Upgrade · price:subscription_max_monthly')).toBeTruthy();
    expect(screen.getByText('Upgrade · price:subscription_max_15x_monthly')).toBeTruthy();
    expect(
      screen.getByText(
        'Upgrades start right away; downgrades start at renewal, and you keep Pro until then.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Basic · monthly'));
    expect(state.purchase).toHaveBeenCalledWith('subscription_basic_monthly');
  });

  it('tells an Android buyer a downgrade is immediate when the server sets it that way', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'google',
    });
    const screen = renderWith(
      iapState({
        catalog: sellingCatalog({
          platform: 'android',
          androidReplacementModes: {
            upgrade: 'charge-prorated-price',
            downgrade: 'without-proration',
          },
        }),
      }),
    );

    expect(
      screen.getByText(
        'A plan change starts right away, and the store shows the exact charge before you confirm.',
      ),
    ).toBeTruthy();
  });

  it('shows a downgrade the store has scheduled and when it starts', () => {
    holdStorePlan('pro');
    const screen = renderWith(iapState({ scheduledProductKey: 'subscription_basic_monthly' }));

    expect(screen.getByText('Changing to Basic at renewal')).toBeTruthy();
  });

  it('confirms a deferred downgrade without claiming the plan already changed', () => {
    holdStorePlan('pro');
    const screen = renderWith(
      iapState({
        lastResult: {
          success: true,
          kind: 'subscription',
          productKey: 'subscription_pro_monthly',
          status: 'already_processed',
          planTier: 'pro',
          scheduledPlanTier: 'basic',
        },
      }),
    );

    expect(
      screen.getByText('Your change to Basic is confirmed and starts at your next renewal.'),
    ).toBeTruthy();
  });

  it('sells top-ups in the app when the catalog returns them', () => {
    holdStorePlan('pro');
    const state = iapState();
    const screen = renderWith(state);

    expect(screen.getByText('Usage top-ups')).toBeTruthy();
    expect(screen.getByText('price:top_up_10')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('500 credits'));
    expect(state.purchase).toHaveBeenCalledWith('top_up_10');
    expect(screen.queryByText(/bought on the web/i)).toBeNull();
  });

  it('shows no top-ups when the catalog leaves them out', () => {
    const screen = renderWith(
      iapState({
        catalog: sellingCatalog({
          products: catalogProducts.filter((product) => product.kind === 'subscription'),
        }),
      }),
    );

    expect(screen.queryByText('Usage top-ups')).toBeNull();
  });

  it('shows a purchase the store is holding as waiting, and asks before sending a second request', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const state = iapState({ awaitingApproval: new Set(['subscription_pro_monthly']) });
    const screen = renderWith(state);

    expect(screen.getByText('Waiting for the store')).toBeTruthy();
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pro · monthly'));

    expect(state.purchase).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'This purchase is already waiting',
      expect.stringContaining('The store hasn’t confirmed your first request yet'),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it('does not sell a second subscription to a plan billed somewhere else', () => {
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });
    const screen = renderWith(iapState());

    expect(screen.queryByLabelText('Max 5x · monthly')).toBeNull();
    expect(screen.getByText('Subscription managed elsewhere')).toBeTruthy();
    expect(screen.getByLabelText('500 credits')).toBeTruthy();
  });

  it("says why plans are withheld when the server withholds them and the app's own plan record is stale", () => {
    const withheld =
      'This account already has an active web subscription. Cancel it on the web before subscribing in the app.';
    const screen = renderWith(
      iapState({
        catalog: {
          ...sellingCatalog(),
          products: sellingCatalog().products.filter((product) => product.kind === 'top_up'),
          subscriptionsUnavailableReason: withheld,
        },
      }),
    );

    expect(screen.queryByLabelText('Max 5x · monthly')).toBeNull();
    expect(screen.getByText('Subscription managed elsewhere')).toBeTruthy();
    expect(screen.getByText(withheld)).toBeTruthy();
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

  it('marks the row unavailable before the tap without sending the buyer elsewhere', () => {
    const iapSpy = jest
      .spyOn(mobileIapHook, 'useMobileIap')
      .mockReturnValue(iapState({ catalog: disabledCatalog() }));
    const { getByLabelText, getByText, queryByText } = render(<CloudBillingScreen />);
    iapSpy.mockRestore();

    const row = getByLabelText('Upgrade plan');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(getByText('Unavailable in the app')).toBeTruthy();
    expect(getByText('In-app purchases are not available yet')).toBeTruthy();
    expect(
      getByText('Your Free plan keeps working. Compare plans to see what each one adds.'),
    ).toBeTruthy();
    expect(getByLabelText('Compare plans').props.accessibilityState?.disabled).not.toBe(true);
    expect(queryByText(/agiworkforce\.com/i)).toBeNull();
    expect(queryByText(/Everything you already pay for/)).toBeNull();
  });

  it('does not open a paywall whose only content is an apology', () => {
    const { getByLabelText } = render(<CloudBillingScreen />);

    fireEvent.press(getByLabelText('Upgrade plan'));

    const props = mockPaywallBottomSheet.mock.calls.at(-1)?.[0] as
      Record<string, unknown> | undefined;
    expect(props?.['primaryActionUnavailableMessage']).toBe(
      "Plan changes aren't available in this app right now.",
    );
  });

  it('opens the Upgrade row as soon as the server catalog sells plans, with no build flag', () => {
    const iapSpy = jest.spyOn(mobileIapHook, 'useMobileIap').mockReturnValue(iapState());
    const { getByLabelText, queryByText } = render(<CloudBillingScreen />);
    iapSpy.mockRestore();

    expect(mockFeatures.billing).toBe(false);
    expect(getByLabelText('Upgrade plan').props.accessibilityState.disabled).toBe(false);
    expect(queryByText('Unavailable in the app')).toBeNull();
    expect(queryByText('Plan changes are not available right now')).toBeNull();
  });

  it('keeps the Upgrade row closed while the catalog sells nothing, whatever the build flag says', () => {
    mockFeatures.billing = true;
    const iapSpy = jest
      .spyOn(mobileIapHook, 'useMobileIap')
      .mockReturnValue(iapState({ catalog: disabledCatalog() }));
    const { getByLabelText } = render(<CloudBillingScreen />);
    iapSpy.mockRestore();

    expect(getByLabelText('Upgrade plan').props.accessibilityState.disabled).toBe(true);
  });

  it('never offers a waitlist or an access code when the store sells nothing', () => {
    const iapSpy = jest
      .spyOn(mobileIapHook, 'useMobileIap')
      .mockReturnValue(iapState({ connected: false, catalog: disabledCatalog() }));

    try {
      const screen = render(<CloudBillingScreen />);

      expect(screen.queryByLabelText('Join upgrade waitlist')).toBeNull();
      expect(screen.queryByLabelText('Upgrade access code')).toBeNull();
      expect(screen.queryByText('Paid upgrades are opening in stages')).toBeNull();
      expect(screen.getByText('Purchases are not available right now')).toBeTruthy();
    } finally {
      iapSpy.mockRestore();
    }
  });
});

describe('web billing links outside the US App Store and on Android', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockWebBillingLinksAllowed = false;
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterAll(() => {
    mockWebBillingLinksAllowed = true;
  });

  it('names where a web-billed plan is managed without a link or portal', () => {
    Object.assign(mockFeatures, { billing: true });
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });

    const { getByText, getByLabelText, queryByText } = render(<CloudBillingScreen />);

    expect(getByText('Managed on the web')).toBeTruthy();
    expect(getByText('On the web')).toBeTruthy();
    expect(queryByText('View invoices')).toBeNull();
    expect(queryByText('Manage billing')).toBeNull();
    expect(queryByText('Manage billing on the web')).toBeNull();
    expect(queryByText('This plan is billed outside the app')).toBeNull();
    expect(getByLabelText('Billing').props.accessibilityState.disabled).toBe(true);
    expect(getByLabelText('Invoices').props.accessibilityState.disabled).toBe(true);
    expect(fetchPortalSessionUrl).not.toHaveBeenCalled();
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it('keeps the double-billing warning but drops its web button', () => {
    Object.assign(mockFeatures, { billing: false });
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'stripe',
    });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Adjust plan'));

    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{ text?: string }>;
    expect(buttons.map((button) => button.text)).toEqual(['OK']);
  });

  it('shows workspace administration as text, not a link', () => {
    Object.assign(mockTierState, {
      tier: 'team',
      billingTier: 'team',
      billingStatus: 'active',
      billingSource: 'none',
    });

    const { getByLabelText, getByText } = render(<CloudBillingScreen />);

    expect(getByText('Managed on the web')).toBeTruthy();
    expect(getByLabelText('Workspace administration').props.accessibilityState.disabled).toBe(true);
  });

  it('sends purchase help to in-app support instead of the website', () => {
    Object.assign(mockTierState, {
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'none',
    });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Help with a purchase'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/support');
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it('keeps the store subscription link a store subscriber needs', () => {
    const urlSpy = jest
      .spyOn(releaseState, 'storeSubscriptionManagementUrl')
      .mockReturnValue('https://play.google.com/store/account/subscriptions');
    const nameSpy = jest.spyOn(releaseState, 'storeDisplayName').mockReturnValue('Google Play');
    Object.assign(mockTierState, {
      tier: 'pro',
      billingTier: 'pro',
      billingStatus: 'active',
      billingSource: 'google',
    });

    const { getByLabelText } = render(<CloudBillingScreen />);
    fireEvent.press(getByLabelText('Manage in Google Play'));

    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions',
    );
    urlSpy.mockRestore();
    nameSpy.mockRestore();
  });
});
