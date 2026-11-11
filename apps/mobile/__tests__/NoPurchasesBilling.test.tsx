import React from 'react';
import { render } from '@testing-library/react-native';
import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

const mockUseIAP = jest.fn();
const mockGetStorefront = jest.fn();
jest.mock('expo-iap', () => ({
  useIAP: (...args: unknown[]) => mockUseIAP(...args),
  getStorefront: (...args: unknown[]) => mockGetStorefront(...args),
  getPendingTransactionsIOS: jest.fn(),
}));

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Sheet = ReactActual.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactActual.useImperativeHandle(ref, () => ({ close: jest.fn(), expand: jest.fn() }));
      return <View>{children}</View>;
    },
  );
  return {
    __esModule: true,
    default: Sheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import storePurchases from '@/src/features/billing/storePurchases.json';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import {
  NATIVE_PURCHASES_NOT_IN_THIS_VERSION,
  fetchMobileIapCatalog,
  readStorefront,
  verifyMobileIapPurchase,
} from '@/src/features/billing/mobileIapService';
import { useMobileIap } from '@/src/features/billing/useMobileIap';
import { useTierStore } from '@/src/features/billing/store';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import CloudBillingScreen from '@/src/features/settings/cloud-billing';
import PlansScreen from '@/src/features/settings/plans';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';

const PURCHASE_WORDS =
  /upgrade|restore purchases|compare plans|view plans|buy|top-up|credits|contact sales|invoice|manage billing|purchase/i;

function signInAs(input: {
  tier: 'free' | 'pro';
  status: string;
  source: MeSubscriptionSource;
  periodEnd?: number | null;
}) {
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useTierStore.setState({
    tier: input.tier,
    billingTier: input.tier,
    billingStatus: input.status,
    billingSource: input.source,
    billingPeriodEnd: input.periodEnd ?? null,
    billingCancelsAtPeriodEnd: false,
    refreshTier: jest.fn().mockResolvedValue(undefined),
  });
}

function visibleText(json: unknown): string {
  return JSON.stringify(json);
}

describe('a build that sells nothing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ships with purchases switched off', () => {
    expect(storePurchases.nativePurchases).toBe(false);
    expect(NATIVE_PURCHASES_AVAILABLE).toBe(false);
  });

  it('never connects to the store, reads the storefront or calls the purchase routes', async () => {
    function Probe() {
      const iap = useMobileIap({ enabled: true });
      expect(iap.connected).toBe(false);
      expect(iap.loading).toBe(false);
      expect(iap.catalog).toBeNull();
      expect(iap.error).toBeNull();
      return null;
    }
    render(<Probe />);

    await expect(readStorefront()).resolves.toBeNull();
    const catalog = await fetchMobileIapCatalog();
    expect(catalog.enabled).toBe(false);
    expect(catalog.products).toEqual([]);
    expect(catalog.unavailableReason).toBe(NATIVE_PURCHASES_NOT_IN_THIS_VERSION);
    await expect(
      verifyMobileIapPurchase({ platform: 'ios', productId: 'p', purchaseToken: 't' }),
    ).rejects.toThrow(NATIVE_PURCHASES_NOT_IN_THIS_VERSION);

    expect(mockUseIAP).not.toHaveBeenCalled();
    expect(mockGetStorefront).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows a Free account its plan with nothing to buy', () => {
    signInAs({ tier: 'free', status: 'none', source: 'none' });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Your plan')).toBeTruthy();
    expect(screen.getByText('You are on the Free plan.')).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
    expect(screen.getByText('What your plan includes')).toBeTruthy();
    expect(screen.getByText('Help with your plan')).toBeTruthy();
    expect(screen.queryByText('Billing')).toBeNull();
    expect(visibleText(screen.toJSON())).not.toMatch(PURCHASE_WORDS);
  });

  it('tells a web-billed account where its plan is managed without linking there', () => {
    signInAs({ tier: 'pro', status: 'active', source: 'stripe', periodEnd: 1_800_000_000 });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Managed on the web')).toBeTruthy();
    expect(screen.getByText('Renews')).toBeTruthy();
    expect(visibleText(screen.toJSON())).not.toMatch(PURCHASE_WORDS);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lists only the plan the account holds', () => {
    signInAs({ tier: 'free', status: 'none', source: 'none' });
    const screen = render(<PlansScreen />);

    expect(screen.getByText('What your plan includes')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.queryByText('Basic')).toBeNull();
    expect(screen.queryByText('Enterprise')).toBeNull();
    expect(screen.queryByText('What each plan includes')).toBeNull();
  });

  it.each([
    ['upgrade', 'model_access', 'This model isn’t included in your plan.'],
    ['subscribe', 'image_generation', 'AI image generation isn’t included in your plan.'],
    ['upgrade', 'token_cap', 'You’ve used what your plan includes for now.'],
  ] as const)(
    'explains a %s paywall for %s without a way to pay',
    (recoveryAction, feature, body) => {
      const screen = render(
        <PaywallBottomSheet
          feature={feature}
          requiredTier="pro"
          recoveryAction={recoveryAction}
          primaryActionUnavailableMessage="Plan changes aren't available in this app right now."
          onDismiss={jest.fn()}
        />,
      );

      expect(screen.getByText('Not included in your plan')).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
      expect(screen.getByLabelText('Close')).toBeTruthy();
      expect(screen.queryByText('Compare plans')).toBeNull();
      expect(screen.queryByText('View upgrade options')).toBeNull();
      expect(screen.queryByText('View plans')).toBeNull();
      expect(screen.queryByText(/Upgrade to/)).toBeNull();
      expect(screen.queryByText(/available in this app/)).toBeNull();
    },
  );

  it('still offers a standard model when the locked item is a model', () => {
    const onChooseStandardModel = jest.fn();
    const screen = render(
      <PaywallBottomSheet
        feature="model_access"
        requiredTier="max"
        onChooseStandardModel={onChooseStandardModel}
        onDismiss={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Choose a standard model')).toBeTruthy();
  });
});
