import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  managedUsageComparisonLabel,
  managedUsageMultiplier,
  managedUsageMultipliers,
} from '@agiworkforce/types';

const webRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

const MULTIPLIER_CLAIM = /(\d+)x\s+(?:more\s+usage\s+than|Pro\s+usage|Basic\s+usage)/giu;

describe('published usage multipliers are derived, not asserted', () => {
  it('computes the multipliers from the governing usage table', () => {
    expect(managedUsageMultiplier('pro', 'basic')).toBe(5);
    expect(managedUsageMultiplier('max', 'pro')).toBe(5);
    expect(managedUsageMultiplier('max_15x', 'pro')).toBeNull();
    expect(managedUsageMultipliers('max_15x', 'pro')).toEqual({
      fiveHour: 20,
      weekly: 10,
      monthly: 10,
    });
    expect(managedUsageMultiplier('team', 'pro')).toBe(1);
    expect(managedUsageMultiplier('enterprise', 'pro')).toBeNull();
  });

  it('names each Max plan for what its five-hour window gives over Pro', () => {
    for (const tier of ['max', 'max_15x'] as const) {
      const factor = managedUsageMultipliers(tier, 'pro')?.fiveHour;
      expect(BILLING_PLAN_PRICING[tier].label).toBe(`Max ${factor}x`);
    }
  });

  it('renders the settings badge from that table rather than a typed string', () => {
    const section = stripComments(read('features/settings/sections/BillingSection.tsx'));
    const display = stripComments(read('features/billing/lib/plan-display.ts'));
    expect(section).toContain('planUsageComparisonLabel');
    expect(display).toContain('managedUsageComparisonLabel');
    for (const source of [section, display]) {
      for (const [, multiplier] of source.matchAll(MULTIPLIER_CLAIM)) {
        throw new Error(`the billing settings publish a hand-typed "${multiplier}x" usage claim`);
      }
    }
  });

  it('keeps every multiplier the pricing surface publishes equal to the table', () => {
    const sources = [
      read('app/pricing/page.tsx'),
      read('features/settings/sections/BillingSection.tsx'),
      read('features/chat/components/InlinePaywallCard.tsx'),
    ].map(stripComments);

    const published = new Set<number>();
    for (const source of sources) {
      for (const match of source.matchAll(MULTIPLIER_CLAIM)) {
        published.add(Number(match[1]));
      }
    }

    const derived = new Set(
      [
        managedUsageMultipliers('pro', 'basic'),
        managedUsageMultipliers('max', 'pro'),
        managedUsageMultipliers('max_15x', 'pro'),
      ].flatMap((windows) => (windows ? Object.values(windows) : [])),
    );

    for (const claim of published) {
      expect(derived.has(claim), `no plan pair in the usage table yields "${claim}x"`).toBe(true);
    }
  });

  it('refuses to publish a comparison the table cannot support', () => {
    expect(managedUsageComparisonLabel('pro', 'basic', 'Basic')).toBe('5x more usage than Basic');
    expect(managedUsageComparisonLabel('max_15x', 'pro', 'Pro')).toBe(
      '20x Pro per 5 hours, 10x per week',
    );
    expect(managedUsageComparisonLabel('team', 'pro', 'Pro')).toBe('Same usage as Pro');
    expect(managedUsageComparisonLabel('enterprise', 'pro', 'Pro')).toBeNull();
  });
});
