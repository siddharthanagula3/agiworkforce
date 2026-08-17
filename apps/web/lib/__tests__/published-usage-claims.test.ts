import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { managedUsageComparisonLabel, managedUsageMultiplier } from '../billing/managed-usage-caps';

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
    expect(managedUsageMultiplier('max_15x', 'pro')).toBe(15);
    expect(managedUsageMultiplier('team', 'pro')).toBe(1);
    expect(managedUsageMultiplier('enterprise', 'pro')).toBeNull();
  });

  it('renders the settings badge from that table rather than a typed string', () => {
    const source = stripComments(read('features/settings/sections/BillingSection.tsx'));
    expect(source).toContain('managedUsageComparisonLabel');
    for (const [, multiplier] of source.matchAll(MULTIPLIER_CLAIM)) {
      throw new Error(`BillingSection publishes a hand-typed "${multiplier}x" usage claim`);
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
        managedUsageMultiplier('pro', 'basic'),
        managedUsageMultiplier('max', 'pro'),
        managedUsageMultiplier('max_15x', 'pro'),
      ].filter((value): value is number => value !== null),
    );

    for (const claim of published) {
      expect(derived.has(claim), `no plan pair in the usage table yields "${claim}x"`).toBe(true);
    }
  });

  it('refuses to publish a comparison the table cannot support', () => {
    expect(managedUsageComparisonLabel('pro', 'basic', 'Basic')).toBe('5x more usage than Basic');
    expect(managedUsageComparisonLabel('team', 'pro', 'Pro')).toBe('Same usage as Pro');
    expect(managedUsageComparisonLabel('enterprise', 'pro', 'Pro')).toBeNull();
  });
});
