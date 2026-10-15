import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { FREE_QUOTA_MEDIA_OFFER_PATH, LOCALIZED_PRICING_PATH } from '@agiworkforce/cloud-contracts';
import { getPublishedPlanPriceCents, type SelfServePaidPlanTier } from '@agiworkforce/types';
import type { SubscriptionPlan } from '@shared/stores/web-auth-store';

const checkoutMocks = vi.hoisted(() => ({
  upgradeToBasicPlan: vi.fn(async () => undefined),
  upgradeToProPlan: vi.fn(async () => undefined),
  upgradeToMaxPlan: vi.fn(async () => undefined),
  upgradeToMax15xPlan: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const { createInstance } = await import('i18next');
  const { resources } = await import('@agiworkforce/i18n');
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: false,
    resources,
    ns: ['pricing', 'models'],
    defaultNS: 'pricing',
    interpolation: { escapeValue: false },
  });
  const t = instance.getFixedT('en', 'pricing');
  return { ...(await importOriginal<ReactI18nextModule>()), useTranslation: () => ({ t }) };
});
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'toast'), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@features/billing/services/stripe-payments', async (importOriginal) => ({
  ...(await importOriginal<StripePaymentsModule>()),
  ...checkoutMocks,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: () => null,
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));
vi.mock('@shared/stores/authentication-store', () => ({
  applyCacheScope: vi.fn(),
  cleanupAllStores: vi.fn(),
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1', email: 'ada@example.com' } }),
}));

import { queryClient, queryKeys } from '@shared/stores/query-client';
import { useUpgradePlanFlow } from './use-upgrade-plan-flow';

type ReactI18nextModule = typeof import('react-i18next');
type StripePaymentsModule = typeof import('@features/billing/services/stripe-payments');
type CsrfModule = typeof import('@/lib/client/csrf');

const FREE: SubscriptionPlan = {
  tier: 'free',
  display_name: 'Free',
  status: 'active',
  current_period_end: null,
  plan_name: 'Free',
};

function Harness() {
  const { openUpgradeDialog, upgradeDialogs } = useUpgradePlanFlow({
    user: { id: 'user-1', email: 'ada@example.com' },
    subscription: FREE,
    currentTier: 'free',
    billingPolicyReady: true,
    openSettings: vi.fn(),
  });
  return (
    <>
      <button type="button" onClick={() => openUpgradeDialog('basic')}>
        Open upgrade
      </button>
      {upgradeDialogs}
    </>
  );
}

const PAID_PLANS: readonly SelfServePaidPlanTier[] = ['basic', 'pro', 'max', 'max_15x', 'team'];

function readyPrice(plan: SelfServePaidPlanTier) {
  return {
    amountMinor: getPublishedPlanPriceCents(plan, 'monthly'),
    currency: 'usd',
    localized: false,
    checkoutReady: true,
  };
}

const LOCALIZED_PRICING = {
  country: 'US',
  requestedCurrency: 'usd',
  plans: Object.fromEntries(PAID_PLANS.map((plan) => [plan, { monthly: readyPrice(plan) }])),
};

const joins: unknown[] = [];
let answerStatus: (body: unknown) => void = () => undefined;

function serve(status: 'held' | 'rate-limited' | { body: unknown }) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === LOCALIZED_PRICING_PATH) {
      return { ok: true, status: 200, json: async () => LOCALIZED_PRICING } as Response;
    }
    if (url === FREE_QUOTA_MEDIA_OFFER_PATH) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ image: null, video: null }),
      } as Response;
    }
    if (url.includes('/api/status/notices')) {
      return { ok: true, json: async () => ({ notices: [] }) } as Response;
    }
    if (url.endsWith('/api/waitlist') && init?.method === 'POST') {
      joins.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    if (url.endsWith('/api/waitlist')) {
      if (status === 'rate-limited') {
        return { ok: false, status: 429, json: async () => ({}) } as Response;
      }
      if (status === 'held') {
        return new Promise<Response>((resolve) => {
          answerStatus = (body) =>
            resolve({ ok: true, status: 200, json: async () => body } as Response);
        });
      }
      return { ok: true, status: 200, json: async () => status.body } as Response;
    }
    return new Promise<Response>(() => undefined);
  });
}

function openUpgrade() {
  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open upgrade' }));
}

describe('the plan card does what it says', () => {
  beforeEach(() => {
    queryClient.clear();
    joins.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers nothing to press until access is known, then opens the checkout it names', async () => {
    serve('held');
    openUpgrade();

    expect(
      await screen.findByRole('button', { name: 'Checking upgrade access for Basic' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Join the Basic waitlist' })).toBeNull();

    answerStatus({ joinedPlans: [], upgradeGateEnabled: true, accessGranted: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Get Basic' }));

    await waitFor(() => expect(checkoutMocks.upgradeToBasicPlan).toHaveBeenCalledTimes(1));
    expect(joins).toEqual([]);
  });

  it('opens checkout from an Upgrade card even when a later access read fails', async () => {
    queryClient.setQueryData(
      queryKeys.billing.upgradeWaitlist('user-1'),
      { joinedPlans: [], upgradeGateEnabled: true, accessGranted: true },
      { updatedAt: Date.now() - 120_000 },
    );
    serve('rate-limited');
    openUpgrade();

    fireEvent.click(await screen.findByRole('button', { name: 'Get Basic' }));

    await waitFor(() => expect(checkoutMocks.upgradeToBasicPlan).toHaveBeenCalledTimes(1));
    expect(joins).toEqual([]);
    expect(screen.queryByText(/when you can upgrade to Basic/)).toBeNull();
  });

  it('joins instead of opening checkout when upgrade access cannot be read', async () => {
    serve('rate-limited');
    openUpgrade();

    fireEvent.click(await screen.findByRole('button', { name: 'Join the Basic waitlist' }));

    expect(
      await screen.findByText('We’ll let you know in Notifications when you can upgrade to Basic.'),
    ).toBeVisible();
    expect(joins).toEqual([
      { plan: 'basic', billingInterval: 'monthly', source: 'billing-upgrade' },
    ]);
    expect(checkoutMocks.upgradeToBasicPlan).not.toHaveBeenCalled();
  });

  it('joins from a Join card and confirms the place, without opening checkout', async () => {
    serve({
      body: {
        joinedPlans: [],
        upgradeGateEnabled: true,
        accessGranted: false,
        noticeEmail: 'ada@example.com',
      },
    });
    openUpgrade();

    fireEvent.click(await screen.findByRole('button', { name: 'Join the Basic waitlist' }));

    expect(
      await screen.findByText('We’ll email ada@example.com when you can upgrade to Basic.'),
    ).toBeVisible();
    expect(joins).toEqual([
      { plan: 'basic', billingInterval: 'monthly', source: 'billing-upgrade' },
    ]);
    expect(checkoutMocks.upgradeToBasicPlan).not.toHaveBeenCalled();
  });
});
