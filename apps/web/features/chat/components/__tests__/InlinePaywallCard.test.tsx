import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlinePaywallCard } from '../InlinePaywallCard';
import type { PaywallFeature, RequiredTier, UserTier } from '../InlinePaywallCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(
  overrides: Partial<{
    feature: PaywallFeature;
    currentTier: UserTier;
    requiredTier: RequiredTier;
    reason: string;
    onUpgrade: () => void;
    onDismiss: () => void;
  }> = {},
) {
  return {
    feature: 'web_search' as PaywallFeature,
    currentTier: 'free' as UserTier,
    requiredTier: 'hobby' as RequiredTier,
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
      ['web_search', 'hobby', 'Upgrade to Hobby for web search'],
      ['video_generation', 'max', 'Upgrade to Max for video generation'],
      ['opus_4_7', 'max', 'Upgrade to Max for Opus 4.7 access'],
      ['gpt_5_5', 'max', 'Upgrade to Max for GPT-5.5 access'],
      ['computer_use', 'pro', 'Upgrade to Pro for computer use'],
      ['deep_research', 'max', 'Upgrade to Max for deep research'],
      ['image_quota', 'hobby', 'Upgrade to Hobby for more image generation'],
      ['token_cap', 'hobby', 'Upgrade to Hobby for higher token limits'],
      ['mcp', 'hobby', 'Upgrade to Hobby for MCP server support'],
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
    it('shows "Hobby" badge for hobby tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'hobby' })} />);
      expect(screen.getByText('Hobby')).toBeInTheDocument();
    });

    it('shows "Max" badge for max tier (pro_plus removed)', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'max' })} />);
      expect(screen.getByText('Max')).toBeInTheDocument();
    });

    it('shows "Max" badge for max tier', () => {
      render(<InlinePaywallCard {...makeProps({ requiredTier: 'max' })} />);
      expect(screen.getByText('Max')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // CTA interactions
  // -------------------------------------------------------------------------

  describe('onUpgrade fires on upgrade click', () => {
    it('calls onUpgrade when upgrade button is clicked', () => {
      const onUpgrade = vi.fn();
      render(<InlinePaywallCard {...makeProps({ onUpgrade })} />);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to hobby/i });
      fireEvent.click(upgradeButton);

      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('does not render a pricing navigation link for the upgrade action', () => {
      render(
        <InlinePaywallCard {...makeProps({ feature: 'web_search', requiredTier: 'hobby' })} />,
      );

      expect(screen.queryByRole('link', { name: /upgrade/i })).not.toBeInTheDocument();
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
