/**
 * billing-waitlist-gate.test.tsx
 *
 * Guards that the incident-response checkout kill-switch blocks purchase
 * requests without reviving the retired managed-cloud waitlist.
 *
 * Checkout is open by default since 2026-07-04 (matching the managed-compute
 * public-alpha decision); NEXT_PUBLIC_CHECKOUT_ENABLED=false/0/off is now an
 * incident-response kill-switch, not the normal state, so these tests set it
 * explicitly rather than relying on it being unset.
 *
 * FAILS without the fix (the components fire live purchase requests).
 * PASSES with the fix (purchase paths remain in context and show an error).
 *
 * Lane files: BillingDashboard.tsx, CreditAlertModal.tsx
 *
 * Credit top-ups (Topup.tsx, api/credit-topup, token-pack-purchase's
 * buyTokenPack) were removed entirely — the locked product rule is "no
 * top-ups, ever". CreditAlertModal now routes an exhausted Max user to
 * Enterprise contact-sales instead of a purchase flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Env: explicitly set the incident-response kill-switch (gated) for these tests
// ---------------------------------------------------------------------------
process.env['NEXT_PUBLIC_CHECKOUT_ENABLED'] = 'false';

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

// stripe-payments service
const mockContactEnterpriseSales = vi.fn();
vi.mock('@features/billing/services/stripe-payments', () => ({
  upgradeToBasicPlan: vi.fn(),
  upgradeToProPlan: vi.fn(),
  upgradeToMaxPlan: vi.fn(),
  contactEnterpriseSales: mockContactEnterpriseSales,
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
  isPlanSelectableOnSurface: () => true,
  getBillingPlanPricing: (tier: string) => ({
    label: tier.charAt(0).toUpperCase() + tier.slice(1),
  }),
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
const { CreditAlertModal } = await import('@shared/components/modals/CreditAlertModal');
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

describe('billing waitlist gate — NEXT_PUBLIC_CHECKOUT_ENABLED=false (kill-switch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['NEXT_PUBLIC_CHECKOUT_ENABLED'] = 'false';

    // Reset window.location.href tracking
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: 'http://localhost/billing' },
    });
  });

  // -------------------------------------------------------------------------
  // CreditAlertModal — exhausted Max plan routes to contact-sales, not a
  // top-up purchase (no-top-ups locked product rule).
  // -------------------------------------------------------------------------

  describe('CreditAlertModal — exhausted Max plan', () => {
    it('calls contactEnterpriseSales instead of any purchase flow', async () => {
      renderCreditAlertModal({ alertType: 'exhausted', currentPlan: 'max' });

      const contactBtn = screen.getByRole('button', { name: /contact sales/i });
      expect(contactBtn).toBeTruthy();

      fireEvent.click(contactBtn);

      await waitFor(() => {
        expect(mockContactEnterpriseSales).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'user-123' }),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // BillingDashboard — handleUpgrade (via header "Upgrade" button)
  // -------------------------------------------------------------------------

  describe('BillingDashboard — handleUpgrade', () => {
    it('shows temporary unavailability without redirecting or calling Stripe', async () => {
      render(React.createElement(BillingDashboard));

      // Basic is the first paid tier on Web, Mobile, and Desktop.
      const allUpgradeBtns = await screen.findAllByRole('button', { name: /upgrade/i });
      const upgradeBtn = allUpgradeBtns.find((btn) =>
        btn.textContent?.toLowerCase().includes('basic'),
      );
      expect(upgradeBtn).toBeTruthy();

      fireEvent.click(upgradeBtn!);

      await waitFor(() => {
        expect(window.location.href).toBe('http://localhost/billing');
      });

      // Confirm no Stripe purchase flow was invoked while the kill-switch is active.
      const { upgradeToProPlan, upgradeToBasicPlan } =
        await import('@features/billing/services/stripe-payments');
      expect(upgradeToProPlan).not.toHaveBeenCalled();
      expect(upgradeToBasicPlan).not.toHaveBeenCalled();
    });
  });
});
