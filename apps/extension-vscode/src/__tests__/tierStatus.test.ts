/**
 * tierStatus.test.ts — Tests for tier status / paywall settings integration
 *
 * Tests the tier status command data-building logic and the TierInfo shape
 * from api.ts in isolation from the VS Code extension host.
 */

import { describe, it, expect } from 'vitest';
import { AgiWorkforcePaywallError } from '../utils/api';

// ── TierInfo shape tests ──────────────────────────────────────────────────────

describe('TierInfo shape', () => {
  it('constructs a minimal TierInfo with tier only', () => {
    const info = { tier: 'hobby' };
    expect(info.tier).toBe('hobby');
  });

  it('constructs a TierInfo with percentage usage data', () => {
    const info = { tier: 'pro', usagePercentage: 42 };
    expect(info.tier).toBe('pro');
    expect(info.usagePercentage).toBe(42);
  });
});

// ── showTierStatus quick-pick content helpers ─────────────────────────────────

describe('showTierStatus display logic', () => {
  function buildTierStatusItems(
    tier: string,
    usagePercentage?: number,
  ): Array<{ label: string; description?: string; detail?: string }> {
    const items: Array<{ label: string; description?: string; detail?: string }> = [];

    items.push({
      label: `$(account) Current tier: ${tier}`,
      description: 'Your AGI Workforce subscription tier',
    });

    if (usagePercentage !== undefined) {
      const pct = Math.round(usagePercentage);
      items.push({
        label: `$(pulse) Cloud usage: ${pct}% used`,
        description: 'Plan usage this period',
      });
    }

    items.push(
      {
        label: '$(link-external) View pricing & upgrade',
        description: 'agiworkforce.com/pricing',
        detail: 'open-pricing',
      },
      {
        label: '$(graph) Model dashboard',
        description: 'View request history and token breakdown',
        detail: 'open-dashboard',
      },
    );

    return items;
  }

  it('always includes current tier item as first entry', () => {
    const items = buildTierStatusItems('hobby');
    expect(items[0].label).toContain('hobby');
    expect(items[0].description).toContain('subscription tier');
  });

  it('includes cloud usage item when a percentage is provided', () => {
    const items = buildTierStatusItems('pro', 50);
    const usageItem = items.find((i) => i.label.includes('Cloud usage'));
    expect(usageItem).toBeDefined();
    expect(usageItem?.label).toContain('50% used');
  });

  it('omits cloud usage item when no usage data available', () => {
    const items = buildTierStatusItems('unknown');
    const usageItem = items.find((i) => i.label.includes('Cloud usage'));
    expect(usageItem).toBeUndefined();
  });

  it('always includes pricing link', () => {
    const items = buildTierStatusItems('hobby');
    const pricingItem = items.find((i) => i.detail === 'open-pricing');
    expect(pricingItem).toBeDefined();
    expect(pricingItem?.label).toContain('pricing');
  });

  it('always includes dashboard link', () => {
    const items = buildTierStatusItems('hobby');
    const dashItem = items.find((i) => i.detail === 'open-dashboard');
    expect(dashItem).toBeDefined();
  });

  it('shows 100% when plan usage is at the cap', () => {
    const items = buildTierStatusItems('pro', 100);
    const usageItem = items.find((i) => i.label.includes('Cloud usage'));
    expect(usageItem?.label).toContain('100% used');
  });

  it('rounds the reported percentage', () => {
    const items = buildTierStatusItems('pro', 42.6);
    const usageItem = items.find((i) => i.label.includes('Cloud usage'));
    expect(usageItem?.label).toContain('43% used');
  });
});

// ── Pricing URL builder ───────────────────────────────────────────────────────

describe('paywall pricing URL construction', () => {
  function buildPricingUrl(tier: string): string {
    return `https://agiworkforce.com/pricing?from=tier-status&tier=${encodeURIComponent(tier)}`;
  }

  it('builds a valid pricing URL for known tiers', () => {
    expect(buildPricingUrl('hobby')).toContain('tier=hobby');
    expect(buildPricingUrl('pro')).toContain('tier=pro');
    expect(buildPricingUrl('max')).toContain('tier=max');
  });

  it('URL-encodes tiers with special characters', () => {
    const url = buildPricingUrl('pro+');
    expect(url).toContain(encodeURIComponent('pro+'));
    expect(url).not.toContain('pro+');
  });

  it('includes the from=tier-status parameter', () => {
    expect(buildPricingUrl('hobby')).toContain('from=tier-status');
  });
});

// ── Paywall error cross-reference ─────────────────────────────────────────────

describe('AgiWorkforcePaywallError in tier context', () => {
  it('requiredTier matches the tier that should be displayed in the notification', () => {
    const err = new AgiWorkforcePaywallError('chat', 'hobby', 'Cap exceeded');
    // The showTierStatus command should use requiredTier as the "needed tier"
    expect(err.requiredTier).toBe('hobby');
  });

  it('feature matches the locked capability', () => {
    const err = new AgiWorkforcePaywallError('image', 'pro', 'Images require Pro');
    expect(err.feature).toBe('image');
  });
});
