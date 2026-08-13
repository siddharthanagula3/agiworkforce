/**
 * `/billing` is no longer a second billing dashboard.
 *
 * It rendered its own older copy of the plan UI, which is how a freshly
 * upgraded Max 15x account saw "Payment successful!" above "Current Plan: FREE"
 * and an "Upgrade to Basic" button. The wired billing UI lives at
 * `/settings/billing`; this route now only greets someone returning from
 * Stripe, and sends every other visit there.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const retrieveSessionMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { retrieve: retrieveSessionMock } };
  },
}));

vi.mock('./UpgradeWelcome', () => ({
  UpgradeWelcome: ({
    checkoutState,
    expectedPlan,
  }: {
    checkoutState: string;
    expectedPlan: string;
  }) => (
    <div>
      upgrade splash {checkoutState} {expectedPlan}
    </div>
  ),
}));

import BillingPage from './page';

beforeEach(() => {
  redirectMock.mockReset();
  authMock.mockReset();
  retrieveSessionMock.mockReset();
  authMock.mockResolvedValue({ userId: 'user_123' });
  retrieveSessionMock.mockResolvedValue({
    id: 'cs_test_checkout123',
    client_reference_id: 'user_123',
    metadata: { user_id: 'user_123', plan_tier: 'max_15x' },
    payment_status: 'paid',
    status: 'complete',
  });
});

describe('BillingPage', () => {
  it('sends an ordinary visit to the real billing UI in settings', async () => {
    render(await BillingPage({ searchParams: Promise.resolve({}) }));
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
  });

  it('greets a verified paid return from the current user Stripe checkout', async () => {
    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText('upgrade splash paid max_15x')).toBeInTheDocument();
    expect(retrieveSessionMock).toHaveBeenCalledWith('cs_test_checkout123');
  });

  it('does not trust success=true without a checkout session id', async () => {
    render(await BillingPage({ searchParams: Promise.resolve({ success: 'true' }) }));
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
    expect(retrieveSessionMock).not.toHaveBeenCalled();
  });

  it('does not show another account checkout result', async () => {
    retrieveSessionMock.mockResolvedValueOnce({
      id: 'cs_test_checkout123',
      client_reference_id: 'another_user',
      metadata: { user_id: 'another_user', plan_tier: 'max_15x' },
      payment_status: 'paid',
      status: 'complete',
    });
    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
    expect(screen.queryByText(/upgrade splash/i)).toBeNull();
  });

  it('does not let conflicting metadata override the checkout session owner', async () => {
    retrieveSessionMock.mockResolvedValueOnce({
      id: 'cs_test_checkout123',
      client_reference_id: 'another_user',
      metadata: { user_id: 'user_123', plan_tier: 'max_15x' },
      payment_status: 'paid',
      status: 'complete',
    });

    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
    expect(screen.queryByText(/upgrade splash/i)).toBeNull();
  });

  it('accepts authenticated metadata only when a legacy session has no primary owner', async () => {
    retrieveSessionMock.mockResolvedValueOnce({
      id: 'cs_test_checkout123',
      client_reference_id: null,
      metadata: { user_id: 'user_123', plan_tier: 'pro' },
      payment_status: 'paid',
      status: 'complete',
    });

    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText('upgrade splash paid pro')).toBeInTheDocument();
  });

  it('uses neutral copy for a verified checkout without a paid status', async () => {
    retrieveSessionMock.mockResolvedValueOnce({
      id: 'cs_test_checkout123',
      client_reference_id: 'user_123',
      metadata: { user_id: 'user_123', plan_tier: 'pro' },
      payment_status: 'no_payment_required',
      status: 'complete',
    });
    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );
    expect(screen.getByText('upgrade splash confirmed pro')).toBeInTheDocument();
  });

  it('does not show a checkout result whose purchased plan cannot be verified', async () => {
    retrieveSessionMock.mockResolvedValueOnce({
      id: 'cs_test_checkout123',
      client_reference_id: 'user_123',
      metadata: { user_id: 'user_123', plan_tier: 'not-a-plan' },
      payment_status: 'paid',
      status: 'complete',
    });

    render(
      await BillingPage({
        searchParams: Promise.resolve({
          success: 'true',
          session_id: 'cs_test_checkout123',
        }),
      }),
    );

    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
    expect(screen.queryByText(/upgrade splash/i)).toBeNull();
  });

  it('does not treat an arbitrary success value as a completed checkout', async () => {
    // Only Stripe's own `success=true` should show the congratulations screen;
    // `?success=1` or a stray param must not.
    render(await BillingPage({ searchParams: Promise.resolve({ success: '1' }) }));
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
  });
});
