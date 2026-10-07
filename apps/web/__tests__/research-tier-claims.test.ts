import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { billingPlanCapabilityPlanLabels, canUseBillingPlanCapability } from '@agiworkforce/types';

const WEB_ROOT = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(WEB_ROOT, path), 'utf8');
}

const FEATURES = read('app/features/page.tsx');
const DEEP_RESEARCH = read('app/features/deep-research/page.tsx');

describe('Deep Research tier claims', () => {
  it('does not promise research from the first day on the free start card', () => {
    expect(FEATURES).not.toMatch(/research from the first day/);
    expect(FEATURES).toContain('web search from the first day');
  });

  it('names the Pro tier on both feature pages and never calls the gate a free trial', () => {
    expect(FEATURES).toContain('Pro plans and above');
    expect(DEEP_RESEARCH).toContain("billingPlanCapabilityPlanLabels('deep_research')");
    expect(DEEP_RESEARCH).toMatch(/Deep Research is included on \{RESEARCH_PLANS\} plans/);
    expect(billingPlanCapabilityPlanLabels('deep_research')).toMatch(/^Pro\b/);
    for (const source of [FEATURES, DEEP_RESEARCH]) {
      expect(source).not.toMatch(/free trial/i);
    }
  });

  it('keeps the phrase true against the catalog', () => {
    expect(canUseBillingPlanCapability('free', 'deep_research')).toBe(false);
    expect(canUseBillingPlanCapability('basic', 'deep_research')).toBe(false);
    for (const tier of ['pro', 'max', 'max_15x', 'team', 'enterprise']) {
      expect(canUseBillingPlanCapability(tier, 'deep_research')).toBe(true);
    }
  });

  it('sends the plans links to the comparison section', () => {
    expect(DEEP_RESEARCH).toContain('/pricing#pricing-compare-title');
    expect(DEEP_RESEARCH).not.toContain('href="/pricing"');
  });
});
