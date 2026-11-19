import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

import {
  BILLING_PLAN_CAPABILITY_LABELS,
  billingPlanCapabilities,
  managedUsageComparisonLines,
} from '@agiworkforce/types';
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
  tier: 'free' | 'pro' | 'max' | 'team';
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
    isRefreshing: false,
    lastRefreshedAt: '2026-11-11T00:00:00.000Z',
    refreshTier: jest.fn().mockResolvedValue(true),
  });
}

function signInWithUnconfirmedPlan(refreshTier: jest.Mock, isRefreshing: boolean) {
  signInAs({ tier: 'free', status: 'none', source: 'none' });
  useTierStore.setState({ lastRefreshedAt: null, isRefreshing, refreshTier });
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
    expect(screen.getByRole('header')).toHaveTextContent('Subscription');
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

  it('does not credit an organization for a personal plan given without a purchase', () => {
    signInAs({ tier: 'pro', status: 'active', source: 'manual' });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Included with your account')).toBeTruthy();
    expect(screen.queryByText('By your organization')).toBeNull();
    expect(visibleText(screen.toJSON())).not.toMatch(PURCHASE_WORDS);
  });

  it.each(['pro', 'team'] as const)(
    'shows no end or renewal date for a %s plan given without a purchase',
    (tier) => {
      signInAs({ tier, status: 'active', source: 'manual', periodEnd: 1_800_000_000 });
      const screen = render(<CloudBillingScreen />);

      expect(screen.queryByText('Renews')).toBeNull();
      expect(screen.queryByText('Included until')).toBeNull();
      expect(screen.queryByText('Access ends')).toBeNull();
      expect(visibleText(screen.toJSON())).not.toMatch(/renews/i);
    },
  );

  it('keeps the end date of a plan given without a purchase once it is set to end', () => {
    signInAs({ tier: 'pro', status: 'active', source: 'manual', periodEnd: 1_800_000_000 });
    useTierStore.setState({ billingCancelsAtPeriodEnd: true });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Access ends')).toBeTruthy();
    expect(screen.queryByText('Renews')).toBeNull();
  });

  it('labels the end date of a plan bought on the web as a renewal', () => {
    signInAs({ tier: 'pro', status: 'active', source: 'stripe', periodEnd: 1_800_000_000 });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Renews')).toBeTruthy();
    expect(screen.queryByText('Included until')).toBeNull();
  });

  it('shows no end date for a plan given without a purchase when the server sends none', () => {
    signInAs({ tier: 'pro', status: 'active', source: 'manual' });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Included with your account')).toBeTruthy();
    expect(screen.queryByText('Included until')).toBeNull();
    expect(screen.queryByText('Renews')).toBeNull();
  });

  it('keeps an organization seat billed by the organization', () => {
    signInAs({ tier: 'team', status: 'active', source: 'manual' });
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('By your organization')).toBeTruthy();
    expect(screen.queryByText('Included with your account')).toBeNull();
  });

  it.each([
    ['pro', 'stripe', 'Managed on the web'],
    ['team', 'manual', 'By your organization'],
    ['pro', 'manual', 'Included with your account'],
  ] as const)(
    'names the %s plan from %s billing in both reviewer notes as the screen does',
    (tier, source, label) => {
      signInAs({ tier, status: 'active', source });
      const screen = render(<CloudBillingScreen />);

      expect(screen.getByText(label)).toBeTruthy();
      for (const file of ['REVIEWER-NOTES-IOS.md', 'REVIEWER-NOTES-ANDROID.md']) {
        const notes = readFileSync(join(__dirname, '..', 'store-listing', file), 'utf8').replace(
          /\s+/g,
          ' ',
        );
        expect([file, notes.includes(`**${label}**`)]).toEqual([file, true]);
      }
    },
  );

  it('does not call a plan Free while the first check is still running', () => {
    signInWithUnconfirmedPlan(
      jest.fn(() => new Promise<boolean>(() => {})),
      true,
    );
    const screen = render(<CloudBillingScreen />);

    expect(screen.getByText('Checking your plan…')).toBeTruthy();
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(screen.queryByText(/Free/)).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(visibleText(screen.toJSON())).not.toMatch(PURCHASE_WORDS);
  });

  it('says the plan could not be read when the check fails, and checks again on request', async () => {
    const refreshTier = jest.fn().mockResolvedValue(false);
    signInWithUnconfirmedPlan(refreshTier, false);
    const screen = render(<CloudBillingScreen />);

    expect(
      await screen.findByText(
        'We couldn’t read your plan just now. Your subscription has not changed.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Not confirmed')).toBeTruthy();
    expect(screen.queryByText(/Free/)).toBeNull();
    expect(visibleText(screen.toJSON())).not.toMatch(PURCHASE_WORDS);

    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(refreshTier).toHaveBeenCalledTimes(2));
  });

  it('shows the plan once a check confirms it', async () => {
    const refreshTier = jest.fn(async () => {
      useTierStore.setState({ lastRefreshedAt: '2026-11-11T00:00:00.000Z' });
      return true;
    });
    signInWithUnconfirmedPlan(refreshTier, false);
    const screen = render(<CloudBillingScreen />);

    expect(await screen.findByText('You are on the Free plan.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('does not describe any plan as the account’s own before it is confirmed', () => {
    signInWithUnconfirmedPlan(jest.fn().mockResolvedValue(false), false);
    const screen = render(<PlansScreen />);

    expect(screen.queryByText('Free')).toBeNull();
    expect(screen.getByText(/couldn’t read your plan just now/)).toBeTruthy();
  });

  it('lists only the plan the account holds', () => {
    signInAs({ tier: 'free', status: 'none', source: 'none' });
    const screen = render(<PlansScreen />);

    expect(screen.getByText('What your plan includes')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('A usage allowance, free models only')).toBeTruthy();
    expect(screen.queryByText(/small allowance/i)).toBeNull();
    expect(screen.queryByText('Basic')).toBeNull();
    expect(screen.queryByText('Enterprise')).toBeNull();
    expect(screen.queryByText('What each plan includes')).toBeNull();
  });

  it('lists only what the plan includes that this app can do, with no comparison to another plan', () => {
    signInAs({ tier: 'max', status: 'active', source: 'stripe' });
    const screen = render(<PlansScreen />);
    const text = visibleText(screen.toJSON());

    expect(billingPlanCapabilities('max')).toEqual(
      expect.arrayContaining(['remote_control', 'managed_api', 'projects']),
    );
    expect(screen.getByText(`• ${BILLING_PLAN_CAPABILITY_LABELS.projects}`)).toBeTruthy();
    expect(screen.queryByText(`• ${BILLING_PLAN_CAPABILITY_LABELS.remote_control}`)).toBeNull();
    expect(screen.queryByText(`• ${BILLING_PLAN_CAPABILITY_LABELS.managed_api}`)).toBeNull();
    expect(screen.queryByText(`• ${BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces}`)).toBeNull();
    expect(managedUsageComparisonLines('max').length).toBeGreaterThan(0);
    for (const line of managedUsageComparisonLines('max')) {
      expect(text).not.toContain(line);
    }
    expect(text).not.toMatch(/more (weekly )?usage than|Same usage as/);
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

  it.each([
    [
      'deep_research',
      'Deep Research is available on Premium, Max, Ultra, Team, and Enterprise plans. Upgrade your plan to use it.',
    ],
    ['model_access', 'It isn’t included in your plan.'],
    [
      'token_cap',
      'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.',
    ],
  ] as const)(
    'shows no reason line that only repeats the sheet or sells a plan (%s)',
    (feature, reason) => {
      const screen = render(
        <PaywallBottomSheet
          feature={feature}
          requiredTier="pro"
          reason={reason}
          onDismiss={jest.fn()}
        />,
      );

      expect(screen.queryByText(reason)).toBeNull();
      expect(screen.queryByText(/upgrade|waitlist|access code|Premium|plans\./i)).toBeNull();
      expect(screen.getByText('Not included in your plan')).toBeTruthy();
    },
  );

  it('keeps the part of a server reason that is not a purchase', () => {
    const screen = render(
      <PaywallBottomSheet
        feature="token_cap"
        requiredTier="pro"
        reason="Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit."
        onDismiss={jest.fn()}
      />,
    );

    expect(screen.getByText('You’ve used what your plan includes for now.')).toBeTruthy();
    expect(
      screen.getByText(
        'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });

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
