import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  InlinePaywallCard,
  normalizePaywallFeature,
  normalizeRequiredTier,
} from '../InlinePaywallCard';
import type { PaywallFeature, RequiredTier, UserTier } from '../InlinePaywallCard';
import type { PaywallRecoveryAction } from '../InlinePaywallCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(
  overrides: Partial<{
    feature: PaywallFeature;
    currentTier: UserTier;
    requiredTier: RequiredTier;
    reason: string;
    recoveryAction: PaywallRecoveryAction;
    onUpgrade: () => void;
    onDismiss: () => void;
  }> = {},
) {
  return {
    feature: 'web_search' as PaywallFeature,
    currentTier: 'free' as UserTier,
    requiredTier: 'basic' as RequiredTier,
    onUpgrade: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('InlinePaywallCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Copy per feature x tier combos
  // -------------------------------------------------------------------------

  describe('headline copy', () => {
    const cases: Array<[PaywallFeature, RequiredTier, string]> = [
      ['web_search', 'basic', 'Upgrade to Basic, $7/mo for web search'],
      ['video_generation', 'max_15x', 'Upgrade to Max 15x, $200/mo for video generation'],
      ['opus_5', 'max', 'Upgrade to Max 5x, $100/mo for Opus 5 access'],
      ['computer_use', 'pro', 'Upgrade to Pro, $20/mo for computer use'],
      ['deep_research', 'max', 'Upgrade to Max 5x, $100/mo for deep research'],
      ['image_quota', 'pro', 'Upgrade to Pro, $20/mo for more image generation'],
      // "usage", not "token": Desktop Cloud said "higher usage limits" for the
      // same refusal, and usage is what every meter in the product is labelled.
      // Both cards now read PAYWALL_FEATURE_COPY.
      ['token_cap', 'basic', 'Upgrade to Basic, $7/mo for higher usage limits'],
      ['mcp', 'basic', 'Upgrade to Basic, $7/mo for MCP server support'],
    ];

    it.each(cases)(
      'feature=%s requiredTier=%s renders "%s"',
      (feature, requiredTier, expectedHeadline) => {
        render(<InlinePaywallCard {...makeProps({ feature, requiredTier })} />);
        expect(screen.getByText(expectedHeadline, { exact: false })).toBeInTheDocument();
      },
    );
  });

  // -------------------------------------------------------------------------
  // Tier badge
  // -------------------------------------------------------------------------

  describe('tier badge', () => {
    it('shows "Basic" badge for basic tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'basic' })} />);
      expect(screen.getByText('Basic')).toBeInTheDocument();
    });

    it('shows "Max 5x" badge for max tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'max' })} />);
      expect(screen.getByText('Max 5x')).toBeInTheDocument();
    });

    it('shows "Max 15x" badge for max_15x tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'max_15x' })} />);
      expect(screen.getByText('Max 15x')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // G11 price disclosure edge cases: per-seat suffix, and the deliberately
  // priceless contract tier.
  // -------------------------------------------------------------------------

  describe('price suffix edge cases', () => {
    it('shows the per-seat rate for the per-seat Team tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'team' })} />);
      expect(
        screen.getByRole('button', { name: 'Upgrade to Team, $25/seat/mo' }),
      ).toBeInTheDocument();
    });

    it('never prints a number for the contract-priced Enterprise tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'enterprise' })} />);
      const button = screen.getByRole('button', { name: 'Upgrade to Enterprise' });
      expect(button).toBeInTheDocument();
      expect(button.textContent).not.toMatch(/\$/);
    });
  });

  // -------------------------------------------------------------------------
  // CTA interactions
  // -------------------------------------------------------------------------

  describe('onUpgrade fires on upgrade click', () => {
    it('calls onUpgrade when upgrade button is clicked', () => {
      const onUpgrade = vi.fn();
      render(<InlinePaywallCard {...makeProps({ onUpgrade })} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to basic/i });
      fireEvent.click(upgradeButton);

      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('offers subscription copy for an account with no active plan', () => {
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'video_generation',
            requiredTier: 'max_15x',
            recoveryAction: 'subscribe',
          })}
        />,
      );

      expect(
        screen.getByText('Subscribe to Max 15x, $200/mo for video generation', { exact: false }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Subscribe to Max 15x, $200/mo' }),
      ).toBeInTheDocument();
    });

    it('offers billing repair instead of an upgrade to an inactive subscriber', () => {
      const onUpgrade = vi.fn();
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'video_generation',
            requiredTier: 'max_15x',
            recoveryAction: 'manage_billing',
            reason: 'Your subscription is past_due. Please update your payment method.',
            onUpgrade,
          })}
        />,
      );

      expect(screen.getByText('Update billing to continue video generation')).toBeInTheDocument();
      expect(screen.queryByText('Upgrade to Max 15x', { exact: false })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('offers usage details without advertising a same-tier upgrade', () => {
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'token_cap',
            currentTier: 'max_15x',
            requiredTier: 'max_15x',
            recoveryAction: 'view_usage',
            reason: 'Your Max 15x usage for this billing period is used up.',
          })}
        />,
      );

      expect(screen.getByRole('button', { name: 'View usage' })).toBeInTheDocument();
      expect(screen.queryByText('Upgrade to Max 15x', { exact: false })).toBeNull();
    });

    it('never offers a tier the subscriber already holds', () => {
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'token_cap',
            currentTier: 'max_15x',
            requiredTier: 'basic',
            recoveryAction: 'upgrade',
          })}
        />,
      );

      expect(screen.queryByText('Upgrade to Basic', { exact: false })).toBeNull();
      expect(screen.getByRole('button', { name: 'View usage' })).toBeInTheDocument();
    });

    it('never offers a subscribe CTA to a subscriber above the required tier', () => {
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'web_search',
            currentTier: 'max',
            requiredTier: 'pro',
            recoveryAction: 'subscribe',
          })}
        />,
      );

      expect(screen.queryByText('Subscribe to', { exact: false })).toBeNull();
      expect(screen.getByRole('button', { name: 'View usage' })).toBeInTheDocument();
    });

    it('still offers a genuine upgrade when the required tier is above the current one', () => {
      render(
        <InlinePaywallCard
          {...makeProps({
            feature: 'web_search',
            currentTier: 'free',
            requiredTier: 'pro',
            recoveryAction: 'upgrade',
          })}
        />,
      );

      expect(screen.getByRole('button', { name: /Upgrade to Pro/ })).toBeInTheDocument();
    });

    it('does not render a pricing navigation link for the upgrade action', () => {
      render(
        <InlinePaywallCard {...makeProps({ feature: 'web_search', requiredTier: 'basic' })} />,
      );

      expect(screen.queryByRole('link', { name: /upgrade/i })).not.toBeInTheDocument();
    });
  });

  describe('untrusted paywall metadata', () => {
    it('normalizes legacy and invalid required tiers to the shared Basic plan', () => {
      expect(normalizeRequiredTier('hobby')).toBe('basic');
      expect(normalizeRequiredTier('not-a-plan')).toBe('basic');
      expect(normalizeRequiredTier('max_15x')).toBe('max_15x');
    });

    it('normalizes unknown feature identifiers to a safe generic capability', () => {
      expect(normalizePaywallFeature('future_server_feature')).toBe('paid_capability');
      expect(normalizePaywallFeature('web_search')).toBe('web_search');
    });
  });

  describe('onDismiss fires on Try-later click', () => {
    it('calls onDismiss when Try later button is clicked', () => {
      const onDismiss = vi.fn();
      render(<InlinePaywallCard {...makeProps({ onDismiss })} />);

      const dismissBtn = screen.getByRole('button', { name: /try later/i });
      fireEvent.click(dismissBtn);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not call onUpgrade when Try later is clicked', () => {
      const onUpgrade = vi.fn();
      const onDismiss = vi.fn();
      render(<InlinePaywallCard {...makeProps({ onUpgrade, onDismiss })} />);

      fireEvent.click(screen.getByRole('button', { name: /try later/i }));

      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Optional reason line
  // -------------------------------------------------------------------------

  describe('reason prop', () => {
    it('renders reason text when provided', () => {
      render(<InlinePaywallCard {...makeProps({ reason: '10/10 images used this month' })} />);
      expect(screen.getByText('10/10 images used this month')).toBeInTheDocument();
    });

    it('does not render a reason paragraph when reason is omitted', () => {
      const { container } = render(<InlinePaywallCard {...makeProps()} />);
      // No <p> with muted-foreground text should exist when reason is empty
      const paras = container.querySelectorAll('p.text-muted-foreground');
      expect(paras).toHaveLength(0);
    });

    it('does not render a reason paragraph when reason is an empty string', () => {
      const { container } = render(<InlinePaywallCard {...makeProps({ reason: '' })} />);
      const paras = container.querySelectorAll('p.text-muted-foreground');
      expect(paras).toHaveLength(0);
    });

    it('renders reason text when reason is a non-empty string', () => {
      render(
        <InlinePaywallCard {...makeProps({ reason: 'You have reached your monthly token cap' })} />,
      );
      expect(screen.getByText('You have reached your monthly token cap')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  describe('accessibility', () => {
    it('card has an aria-labelledby pointing to the title element', () => {
      const { container } = render(<InlinePaywallCard {...makeProps()} />);
      const section = container.querySelector('[aria-labelledby="paywall-card-title"]');
      expect(section).toBeInTheDocument();
      const titleEl = document.getElementById('paywall-card-title');
      expect(titleEl).toBeInTheDocument();
    });
  });
});
