import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
type StripePayments = typeof import('../services/stripe-payments');
type UpgradeWaitlistService = typeof import('../services/upgrade-waitlist');

const paymentMocks = vi.hoisted(() => ({
  previewUpgrade: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  startPlanCheckout: vi.fn(),
  fetchSavedPaymentMethods: vi.fn(),
  openBillingPortal: vi.fn(async () => {}),
}));

const waitlistMocks = vi.hoisted(() => ({
  status: {
    joinedPlans: [] as string[],
    upgradeGateEnabled: true,
    accessGranted: false,
  },
  join: vi.fn(),
  redeem: vi.fn(),
}));

vi.mock('../services/stripe-payments', async (importOriginal) => ({
  ...(await importOriginal<StripePayments>()),
  ...paymentMocks,
}));

vi.mock('../services/upgrade-waitlist', async (importOriginal) => ({
  ...(await importOriginal<UpgradeWaitlistService>()),
  joinUpgradeWaitlist: waitlistMocks.join,
  redeemUpgradeAccessCode: waitlistMocks.redeem,
}));

vi.mock('../hooks/use-upgrade-waitlist', () => ({
  resolveUpgradeWaitlistStatus: vi.fn(),
  useUpgradeWaitlistStatus: () => ({
    status: waitlistMocks.status,
    recordJoined: (plan: string) => {
      waitlistMocks.status.joinedPlans = [...waitlistMocks.status.joinedPlans, plan];
    },
    recordAccessGranted: vi.fn(),
  }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  applyCacheScope: vi.fn(),
  cleanupAllStores: vi.fn(),
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      initialized: true,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'ada@example.com' },
    }),
}));

vi.mock('@shared/components/ServiceNotices', () => ({ ServiceNotices: () => null }));

import { CheckoutRequiredError } from '../services/stripe-payments';
import { UpgradeOrderPanel } from './UpgradeOrderPanel';

describe('UpgradeOrderPanel waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitlistMocks.status = { joinedPlans: [], upgradeGateEnabled: true, accessGranted: false };
    waitlistMocks.join.mockResolvedValue(undefined);
    paymentMocks.previewUpgrade.mockRejectedValue(
      new CheckoutRequiredError('Starting this paid plan requires Stripe Checkout.', 10_000, 'usd'),
    );
    paymentMocks.fetchSavedPaymentMethods.mockResolvedValue([]);
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  });

  it('confirms a waitlist place only for the capacity it was joined for', async () => {
    const view = render(<UpgradeOrderPanel plan="max" returnPath="/upgrade/max" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Join upgrade waitlist' }));
    expect(
      await screen.findByRole('heading', { name: 'You’re on the Max 5x waitlist' }),
    ).toBeVisible();

    view.rerender(<UpgradeOrderPanel plan="max_15x" returnPath="/upgrade/max_15x" />);

    expect(
      await screen.findByRole('heading', { name: 'Join the Max 20x upgrade waitlist' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join upgrade waitlist' })).toBeEnabled();
    expect(screen.queryByText(/when you can upgrade to Max 20x/)).toBeNull();
    expect(waitlistMocks.join.mock.calls).toEqual([[{ plan: 'max', billingInterval: 'monthly' }]]);

    view.rerender(<UpgradeOrderPanel plan="max" returnPath="/upgrade/max" />);

    expect(
      await screen.findByRole('heading', { name: 'You’re on the Max 5x waitlist' }),
    ).toBeVisible();
  });
});
