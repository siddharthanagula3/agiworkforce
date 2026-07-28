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

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('./UpgradeWelcome', () => ({
  UpgradeWelcome: () => <div>upgrade splash</div>,
}));

import BillingPage from './page';

beforeEach(() => {
  redirectMock.mockReset();
});

describe('BillingPage', () => {
  it('sends an ordinary visit to the real billing UI in settings', async () => {
    render(await BillingPage({ searchParams: Promise.resolve({}) }));
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
  });

  it('greets a return from Stripe checkout instead of redirecting', async () => {
    render(await BillingPage({ searchParams: Promise.resolve({ success: 'true' }) }));
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText('upgrade splash')).toBeInTheDocument();
  });

  it('does not treat an arbitrary success value as a completed checkout', async () => {
    // Only Stripe's own `success=true` should show the congratulations screen;
    // `?success=1` or a stray param must not.
    render(await BillingPage({ searchParams: Promise.resolve({ success: '1' }) }));
    expect(redirectMock).toHaveBeenCalledWith('/settings/billing');
  });
});
