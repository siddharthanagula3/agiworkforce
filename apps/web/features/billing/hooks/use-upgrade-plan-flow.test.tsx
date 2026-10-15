import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SubscriptionPlan } from '@shared/stores/web-auth-store';

const checkoutMocks = vi.hoisted(() => ({
  upgradeToBasicPlan: vi.fn(async () => undefined),
  upgradeToProPlan: vi.fn(async () => undefined),
  upgradeToMaxPlan: vi.fn(async () => undefined),
  upgradeToMax15xPlan: vi.fn(async () => undefined),
}));

const waitlistMocks = vi.hoisted(() => ({
  resolveStatus: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  loading: vi.fn(() => 'toast'),
  dismiss: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('@features/billing/services/stripe-payments', async (importOriginal) => ({
  ...(await importOriginal<StripePaymentsModule>()),
  ...checkoutMocks,
}));
vi.mock('@features/billing/hooks/use-upgrade-waitlist', () => ({
  resolveUpgradeWaitlistStatus: waitlistMocks.resolveStatus,
  useUpgradeWaitlistStatus: vi.fn(),
}));
vi.mock('@/features/chat/components/dialogs/UpgradePlanDialog', () => ({
  UpgradePlanDialog: ({
    open,
    waitlistApplies,
    onUpgrade,
  }: {
    open: boolean;
    waitlistApplies?: boolean;
    onUpgrade: (plan: 'basic', action: 'checkout' | 'join-waitlist' | 'open-waitlist') => void;
  }) =>
    open ? (
      <div data-testid="plan-dialog" data-waitlist-applies={String(waitlistApplies)}>
        <button type="button" onClick={() => onUpgrade('basic', 'checkout')}>
          Upgrade to Basic
        </button>
        <button type="button" onClick={() => onUpgrade('basic', 'join-waitlist')}>
          Join the Basic waitlist
        </button>
        <button type="button" onClick={() => onUpgrade('basic', 'open-waitlist')}>
          Enter access code for Basic
        </button>
      </div>
    ) : null,
}));
vi.mock('@features/billing/components/UpgradeConfirmDialog', () => ({
  UpgradeConfirmDialog: ({ request }: { request: { plan: string } | null }) =>
    request ? <div>{`Confirm ${request.plan}`}</div> : null,
}));
vi.mock('@features/billing/components/UpgradeWaitlistDialog', () => ({
  UpgradeWaitlistDialog: ({
    request,
    joinOnOpen,
  }: {
    request: { plan: string } | null;
    joinOnOpen?: boolean;
  }) =>
    request ? (
      <div>{`Waitlist for ${request.plan}${joinOnOpen ? ', joining on open' : ''}`}</div>
    ) : null,
  UpgradeWaitlistPanel: () => null,
}));

import { UpgradeAccessRequiredError } from '@features/billing/services/stripe-payments';
import { useUpgradePlanFlow } from './use-upgrade-plan-flow';

type StripePaymentsModule = typeof import('@features/billing/services/stripe-payments');

const user = { id: 'user-1', email: 'ada@example.com' };

function Harness({ subscription }: { subscription: SubscriptionPlan | null }) {
  const { openUpgradeDialog, upgradeDialogs } = useUpgradePlanFlow({
    user,
    subscription,
    currentTier: subscription?.tier ?? 'free',
    billingPolicyReady: true,
    openSettings: vi.fn(),
  });
  return (
    <>
      <button type="button" onClick={() => openUpgradeDialog()}>
        Upgrade
      </button>
      {upgradeDialogs}
    </>
  );
}

const FREE: SubscriptionPlan = {
  tier: 'free',
  display_name: 'Free',
  status: 'active',
  current_period_end: null,
  plan_name: 'Free',
};

function pickBasic(card = 'Upgrade to Basic', subscription: SubscriptionPlan | null = FREE) {
  render(<Harness subscription={subscription} />);
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
  fireEvent.click(screen.getByRole('button', { name: card }));
}

describe('useUpgradePlanFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an account that redeemed an access code straight to checkout', async () => {
    pickBasic('Upgrade to Basic');

    await waitFor(() =>
      expect(checkoutMocks.upgradeToBasicPlan).toHaveBeenCalledWith({
        userId: 'user-1',
        userEmail: 'ada@example.com',
      }),
    );
    expect(screen.queryByText(/Waitlist for basic/)).toBeNull();
  });

  it('joins the waitlist the plan card names, in the shared waitlist dialog', async () => {
    pickBasic('Join the Basic waitlist');

    expect(await screen.findByText('Waitlist for basic, joining on open')).toBeVisible();
    expect(checkoutMocks.upgradeToBasicPlan).not.toHaveBeenCalled();
  });

  it('opens a plan the account already joined without joining it again', async () => {
    pickBasic('Enter access code for Basic');

    expect(await screen.findByText('Waitlist for basic')).toBeVisible();
    expect(checkoutMocks.upgradeToBasicPlan).not.toHaveBeenCalled();
  });

  it('does what the card said without reading upgrade access a second time', async () => {
    waitlistMocks.resolveStatus.mockResolvedValue(null);

    pickBasic('Upgrade to Basic');
    await waitFor(() => expect(checkoutMocks.upgradeToBasicPlan).toHaveBeenCalledTimes(1));
    cleanup();
    pickBasic('Join the Basic waitlist');
    expect(await screen.findByText('Waitlist for basic, joining on open')).toBeVisible();

    expect(waitlistMocks.resolveStatus).not.toHaveBeenCalled();
    expect(checkoutMocks.upgradeToBasicPlan).toHaveBeenCalledTimes(1);
  });

  it('opens the waitlist without joining when checkout says upgrade access is required', async () => {
    checkoutMocks.upgradeToBasicPlan.mockRejectedValueOnce(
      new UpgradeAccessRequiredError(
        'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.',
      ),
    );

    pickBasic('Upgrade to Basic');

    expect(await screen.findByText('Waitlist for basic')).toBeVisible();
    expect(screen.queryByText('Waitlist for basic, joining on open')).toBeNull();
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('reports any other checkout failure and opens no waitlist', async () => {
    checkoutMocks.upgradeToBasicPlan.mockRejectedValueOnce(new Error('Checkout is unavailable.'));

    pickBasic('Upgrade to Basic');

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Checkout is unavailable.'));
    expect(screen.queryByText(/Waitlist for basic/)).toBeNull();
  });

  it('lets the plan dialog weigh the waitlist for an account without a paid plan', () => {
    render(<Harness subscription={FREE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(screen.getByTestId('plan-dialog')).toHaveAttribute('data-waitlist-applies', 'true');
  });

  it('never puts a paying subscriber through the waitlist', async () => {
    pickBasic('Upgrade to Basic', {
      ...FREE,
      tier: 'pro',
      display_name: 'Pro',
      plan_name: 'Pro',
      subscription_source: 'stripe',
    });

    expect(await screen.findByText('Confirm basic')).toBeVisible();
    expect(waitlistMocks.resolveStatus).not.toHaveBeenCalled();
  });

  it('tells the plan dialog the waitlist never applies to a paying subscriber', () => {
    render(
      <Harness
        subscription={{
          ...FREE,
          tier: 'pro',
          display_name: 'Pro',
          plan_name: 'Pro',
          subscription_source: 'stripe',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(screen.getByTestId('plan-dialog')).toHaveAttribute('data-waitlist-applies', 'false');
  });
});
