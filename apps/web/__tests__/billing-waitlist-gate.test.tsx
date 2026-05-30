/**
 * billing-waitlist-gate.test.tsx
 *
 * Guards that free users are routed to /pricing#waitlist (not a live
 * Stripe checkout flow) when NEXT_PUBLIC_CHECKOUT_ENABLED is not set.
 *
 * FAILS without the fix (the components fire live purchase requests).
 * PASSES with the fix (all purchase paths redirect to the waitlist).
 *
 * Lane files: BillingDashboard.tsx, CreditAlertModal.tsx, Topup.tsx (indirect)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Env: ensure NEXT_PUBLIC_CHECKOUT_ENABLED is absent (gated) for these tests
// ---------------------------------------------------------------------------
delete process.env['NEXT_PUBLIC_CHECKOUT_ENABLED'];

// ---------------------------------------------------------------------------
// Mocks: establish before static imports
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: vi.fn(() => null) }),
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
  usePathname: () => '/billing',
}));

// Mock next/link to a plain anchor
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock window.location.href (jsdom allows assignment)
const originalLocation = window.location;

// Auth store — simulate a logged-in user
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-123', email: 'user@example.com', user_metadata: {} },
  })),
}));

// buyTokenPack — we must confirm it is NOT called when the gate is closed
const mockBuyTokenPack = vi.fn();
vi.mock('@features/billing/services/token-pack-purchase', () => ({
  buyTokenPack: mockBuyTokenPack,
  addTokensToUserBalance: vi.fn(),
  getUserTokenBalance: vi.fn(() => Promise.resolve(0)),
}));

// stripe-payments service
vi.mock('@features/billing/services/stripe-payments', () => ({
  upgradeToHobbyPlan: vi.fn(),
  upgradeToProPlan: vi.fn(),
  upgradeToMaxPlan: vi.fn(),
  contactEnterpriseSales: vi.fn(),
  openBillingPortal: vi.fn(),
  isStripeConfigured: vi.fn(() => false),
}));

// Billing React Query hooks — return empty/idle state so BillingDashboard renders
vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: vi.fn(() => ({ data: null, isLoading: false, error: null, refetch: vi.fn() })),
  useInvoices: vi.fn(() => ({ data: [], isLoading: false })),
  usePaymentMethods: vi.fn(() => ({ data: [], isLoading: false })),
  useInvalidateBillingQueries: vi.fn(() => vi.fn()),
}));

// Billing sub-components rendered by BillingDashboard — stub to avoid deep render
vi.mock('@features/billing/components/Billing/Subscription', () => ({
  Subscription: () => React.createElement('div', { 'data-testid': 'stub-subscription' }),
}));
vi.mock('@features/billing/components/Billing/Usage', () => ({
  Usage: () => React.createElement('div', { 'data-testid': 'stub-usage' }),
}));
vi.mock('@features/billing/components/Billing/Topup', () => ({
  // Render a button that triggers onBuyTokenPack so we can test that path too
  Topup: ({
    onBuyTokenPack,
    onUpgradePro,
  }: {
    onBuyTokenPack: (pack: { id: string; name: string; credits: number; price: number }) => void;
    onUpgradePro: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'stub-topup' },
      React.createElement(
        'button',
        {
          'data-testid': 'buy-token-pack-btn',
          onClick: () =>
            onBuyTokenPack({ id: 'pack-100', name: 'Pack 100', credits: 100000, price: 29 }),
        },
        'Buy Pack',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'upgrade-pro-btn', onClick: onUpgradePro },
        'Upgrade Pro',
      ),
    ),
}));

// ErrorBoundary — pass-through
vi.mock('@shared/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

// toast (sonner) — no-op
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

// @agiworkforce/types
vi.mock('@agiworkforce/types', () => ({
  getPlanPriceUsd: vi.fn(() => 29),
  getPlanUsageBudgetCents: vi.fn(() => 50000),
}));

// @/components/ui — minimal button stub
vi.mock('@/components/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => React.createElement('button', { onClick, disabled }, children),
}));

// ---------------------------------------------------------------------------
// Lazy-import after mocks
// ---------------------------------------------------------------------------
const { CreditAlertModal } = await import('@/components/modals/CreditAlertModal');
const BillingDashboard = (await import('@/features/billing/pages/BillingDashboard')).default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCreditAlertModal(overrides: Partial<Parameters<typeof CreditAlertModal>[0]> = {}) {
  return render(
    React.createElement(CreditAlertModal, {
      isOpen: true,
      onClose: vi.fn(),
      alertType: 'exhausted',
      currentPlan: 'max',
      remainingCents: 0,
      allocatedCents: 10000,
      percentageUsed: 100,
      ...overrides,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('billing waitlist gate — NEXT_PUBLIC_CHECKOUT_ENABLED absent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_CHECKOUT_ENABLED'];

    // Reset window.location.href tracking
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: 'http://localhost/billing' },
    });
  });

  // -------------------------------------------------------------------------
  // CreditAlertModal
  // -------------------------------------------------------------------------

  describe('CreditAlertModal — handleBuyTopUp', () => {
    it('routes to /pricing#waitlist, does NOT call buyTokenPack, when gate is off', async () => {
      renderCreditAlertModal({ alertType: 'exhausted', currentPlan: 'max' });

      // The "Buy 10000 Credits" button is rendered for isMaxPlan + exhausted
      const buyBtn = screen.getByRole('button', { name: /buy 10000 credits/i });
      expect(buyBtn).toBeTruthy();

      fireEvent.click(buyBtn);

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/pricing#waitlist');
      });
      expect(mockBuyTokenPack).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // BillingDashboard — handleUpgrade (via header "Upgrade" button)
  // -------------------------------------------------------------------------

  describe('BillingDashboard — handleUpgrade', () => {
    it('redirects to /pricing#waitlist, does NOT call stripe service, when gate is off', async () => {
      render(React.createElement(BillingDashboard));

      // The header CTA "Upgrade to Hobby" button has the gradient-primary class.
      // Use getAllByRole and pick the button whose accessible name includes "Hobby"
      // (it contains a visible <span class="hidden sm:inline">Upgrade to Hobby</span>).
      // The Topup stub renders a separate "Upgrade Pro" button — we want the header one.
      const allUpgradeBtns = await screen.findAllByRole('button', { name: /upgrade/i });
      // The dashboard header button contains "Hobby" in its accessible name;
      // pick it so the click fires handleUpgrade('hobby').
      const upgradeBtn = allUpgradeBtns.find((btn) =>
        btn.textContent?.toLowerCase().includes('hobby'),
      );
      expect(upgradeBtn).toBeTruthy();

      fireEvent.click(upgradeBtn!);

      await waitFor(() => {
        expect(window.location.href).toBe('/pricing#waitlist');
      });

      // Confirm the stripe service was not called
      const { upgradeToHobbyPlan } = await import('@features/billing/services/stripe-payments');
      expect(upgradeToHobbyPlan).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // BillingDashboard — handleBuyTokenPack (via Topup stub)
  // -------------------------------------------------------------------------

  describe('BillingDashboard — handleBuyTokenPack', () => {
    it('redirects to /pricing#waitlist, does NOT call buyTokenPack, when gate is off', async () => {
      render(React.createElement(BillingDashboard));

      const buyPackBtn = await screen.findByTestId('buy-token-pack-btn');
      fireEvent.click(buyPackBtn);

      await waitFor(() => {
        expect(window.location.href).toBe('/pricing#waitlist');
      });
      expect(mockBuyTokenPack).not.toHaveBeenCalled();
    });
  });
});
