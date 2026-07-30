import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const testState = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string } },
  billing: null as null | { plan: string; status: string },
}));

const stripeMocks = vi.hoisted(() => ({
  upgradeToBasicPlan: vi.fn(),
  upgradeToProPlan: vi.fn(),
  upgradeToMaxPlan: vi.fn(),
  upgradeToMax15xPlan: vi.fn(),
  upgradePlanMidCycle: vi.fn(),
  previewUpgrade: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === 'compareProInterval' && values?.['yearly']
        ? `${key} ${String(values['yearly'])}`
        : key,
  }),
}));
vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(testState.auth),
}));
vi.mock('@features/billing/services/stripe-payments', () => ({
  ...stripeMocks,
}));
vi.mock('@features/billing/hooks/use-billing-queries', () => ({
  useBillingData: () => ({ data: testState.billing, isLoading: false }),
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children?: React.ReactNode }) => <article>{children}</article>,
}));
vi.mock('@/features/marketing/components/WaitlistModal', () => ({
  WaitlistTrigger: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock('../byok/WaitlistForm', () => ({ WaitlistForm: () => <div /> }));

import PricingPage from './page';

describe('PricingPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    testState.auth.user = null;
    testState.billing = null;
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  });

  it('renders every public plan from the shared catalog, including Basic and both Max tiers', async () => {
    render(<PricingPage />);

    await waitFor(() => expect(screen.getAllByText('Basic').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Max 5x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Max 15x').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('custom').length).toBeGreaterThan(0);
    expect(screen.queryByText('$25')).toBeNull();
  });

  it('keeps Team visible but routes it to sales instead of personal checkout', async () => {
    render(<PricingPage />);

    const teamSalesLink = (await screen.findAllByRole('link', { name: 'talkToSalesCta' })).find(
      (link) => link.getAttribute('href') === '/contact-sales?plan=team',
    );
    expect(teamSalesLink).toBeDefined();
    expect(screen.queryByRole('button', { name: 'teamCta' })).toBeNull();
  });

  it('shows the enforceable project, MCP, media, and developer-surface plan differences', async () => {
    render(<PricingPage />);

    const comparison = screen.getByRole('table', { name: 'Plan capabilities' });
    const rows = within(comparison);
    expect(rows.getByRole('row', { name: /^Free / })).toHaveAccessibleName(
      'Free free foreverLabel compareFreeUsage 1 project 1 custom MCP Yes No No No No No managed access No compareFreeBestFor',
    );
    expect(rows.getByRole('row', { name: /^Basic / })).toHaveAccessibleName(
      'Basic $7/mo monthly compareBasicUsage 5 projects 5 custom MCP Yes No No No No No managed access No compareBasicBestFor',
    );
    expect(rows.getByRole('row', { name: /^Pro / })).toHaveAccessibleName(
      'Pro $20/mo compareProInterval $16.67 compareProUsage 25 projects 25 custom MCP Yes Yes Yes No Yes CLI, Chrome & VS Code No compareProBestFor',
    );
    expect(rows.getByRole('row', { name: /^Max 5x / })).toHaveAccessibleName(
      'Max 5x $100/mo monthlyOnly compareMaxUsage Unlimited Unlimited Yes Yes Yes No Yes CLI, Chrome & VS Code No compareMaxBestFor',
    );
    expect(rows.getByRole('row', { name: /^Max 15x / })).toHaveAccessibleName(
      'Max 15x $200/mo monthlyOnly 15x Pro usage Unlimited Unlimited Yes Yes Yes Yes Yes CLI, Chrome & VS Code No Highest-capacity work and video generation',
    );
    expect(rows.getByRole('row', { name: /^Team / })).toHaveAccessibleName(
      'Team custom compareTeamBilling compareTeamUsage 25 projects 25 custom MCP Yes Yes Yes No Yes CLI, Chrome & VS Code Sales-assisted pilot compareTeamBestFor',
    );
  });

  it('renders trusted regional prices without exposing India pricing to other regions', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'IN',
        requestedCurrency: 'inr',
        plans: {
          basic: {
            monthly: {
              amountMinor: 39_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          pro: {
            monthly: {
              amountMinor: 199_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          max: {
            monthly: {
              amountMinor: 999_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          max_15x: {
            monthly: {
              amountMinor: 2_499_900,
              currency: 'inr',
              localized: true,
              checkoutReady: true,
            },
          },
          team: {},
        },
      }),
    } as Response);

    render(<PricingPage />);

    await waitFor(() => expect(screen.getAllByText('₹399').length).toBeGreaterThan(0));
    expect(screen.getAllByText('₹1,999').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹9,999').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹24,999').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /INR/i })).not.toBeInTheDocument();
  });

  it('confirms the prorated amount before charging an active paid subscriber mid-cycle', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'pro', status: 'active' };
    stripeMocks.previewUpgrade.mockResolvedValueOnce({
      amountDueNowCents: 4200,
      currency: 'usd',
      previewToken: 'signed-preview-token',
    });
    stripeMocks.upgradePlanMidCycle.mockResolvedValueOnce({ activation: 'webhook_pending' });

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'maxCta' }));

    // The upgrade must NOT charge silently: it opens the confirm dialog, which
    // previews the exact prorated amount first, and only charges on confirm.
    const confirmBtn = await screen.findByRole('button', { name: /confirm/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    expect(stripeMocks.upgradePlanMidCycle).not.toHaveBeenCalled();

    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(stripeMocks.upgradePlanMidCycle).toHaveBeenCalledWith({
        plan: 'max',
        billingInterval: 'monthly',
        previewToken: 'signed-preview-token',
      }),
    );
    expect(stripeMocks.upgradeToMaxPlan).not.toHaveBeenCalled();
  });

  it('prevents active subscribers from purchasing their current or a lower plan', () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    testState.billing = { plan: 'pro', status: 'active' };

    render(<PricingPage />);

    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
      'href',
      '/billing',
    );
    expect(screen.queryByRole('button', { name: 'basicCta' })).toBeNull();
    expect(screen.getByRole('button', { name: 'maxCta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Get Max 15x' })).toBeEnabled();
  });

  it('keeps paid checkout disabled until trusted localized prices are ready', () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    render(<PricingPage />);

    expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled();
    expect(screen.getByText('Loading checkout availability…')).toBeTruthy();
  });

  it('disables only plans whose trusted localized checkout price is unavailable', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'US',
        requestedCurrency: 'usd',
        plans: {
          basic: {
            monthly: {
              amountMinor: 700,
              currency: 'usd',
              localized: false,
              checkoutReady: false,
            },
          },
          pro: {
            monthly: {
              amountMinor: 2_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 20_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          max: {
            monthly: {
              amountMinor: 10_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          max_15x: {
            monthly: {
              amountMinor: 20_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
          team: {
            monthly: {
              amountMinor: 2_500,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 24_000,
              currency: 'usd',
              localized: false,
              checkoutReady: true,
            },
          },
        },
      }),
    } as Response);

    render(<PricingPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'proCta' })).toBeEnabled();
    expect(screen.getByText('Basic checkout is not available in your region yet.')).toBeTruthy();
  });

  it('keeps checkout disabled when regional pricing verification fails', async () => {
    testState.auth.user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network unavailable'));

    render(<PricingPage />);

    expect(
      await screen.findByText(
        'Checkout availability could not be verified. Refresh this page to try again.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'basicCta' })).toBeDisabled();
  });

  it('uses localized annual Pro pricing while keeping Team custom', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        country: 'GB',
        requestedCurrency: 'gbp',
        plans: {
          basic: {},
          pro: {
            monthly: {
              amountMinor: 1_800,
              currency: 'gbp',
              localized: true,
              checkoutReady: true,
            },
            yearly: {
              amountMinor: 18_000,
              currency: 'gbp',
              localized: true,
              checkoutReady: true,
            },
          },
          max: {},
          max_15x: {},
        },
      }),
    } as Response);

    render(<PricingPage />);
    fireEvent.click(screen.getByRole('button', { name: /annual/i }));

    await waitFor(() => expect(screen.getAllByText('£15').length).toBeGreaterThan(0));
    expect(screen.getByRole('row', { name: /^Pro / })).toHaveTextContent('£15');
    expect(screen.getByRole('row', { name: /^Team / })).toHaveTextContent('custom');
    expect(screen.queryByText('£18')).toBeNull();
  });

  it('does not render the obsolete managed-cloud early-access waitlist', () => {
    render(<PricingPage />);

    expect(screen.queryByText('waitlistHeading')).toBeNull();
    expect(screen.queryByText('requestHostedAccessCta')).toBeNull();
  });
});
