import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  getBillingPlanPricing,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { planComparisonViews } from '../src/features/side-panel/planComparison';

const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '_locales', 'en', 'messages.json'),
    'utf8',
  ),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

// What chrome.i18n.getMessage does with the English catalog: each $NAME$ is
// replaced by its placeholder content, and $1..$9 in that content by the
// substitutions, so the assertions below read the sentence a user sees.
function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

function includedLabels(plan: BillingPlanTier): string {
  return billingPlanCapabilities(plan)
    .map((capability) => BILLING_PLAN_CAPABILITY_LABELS[capability])
    .join(', ');
}

function row(views: ReturnType<typeof planComparisonViews>, plan: BillingPlanTier) {
  const label = getBillingPlanPricing(plan).label;
  const view = views.find(
    (candidate) => candidate.label === label || candidate.label === `${label} (your plan)`,
  );
  expect(view, plan).toBeDefined();
  return view!;
}

describe('side panel plan comparison', () => {
  beforeEach(() => {
    (globalThis as { chrome?: unknown }).chrome = { i18n: { getMessage } };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('lists Free, every self-serve paid plan and Enterprise under their catalog labels', () => {
    const views = planComparisonViews(null);

    expect(views.map((view) => view.label)).toEqual(
      (['free', ...SELF_SERVE_PAID_PLAN_TIERS, 'enterprise'] as BillingPlanTier[]).map(
        (plan) => getBillingPlanPricing(plan).label,
      ),
    );
    expect(views.map((view) => view.label)).toContain('Max 20x');
    expect(views.some((view) => view.current)).toBe(false);
  });

  it('states each plan’s usage relative to the plan below it, never as credit counts', () => {
    const views = planComparisonViews(null);

    expect(row(views, 'basic').usage).toBe('5x more usage per session than Free');
    expect(row(views, 'pro').usage).toBe('5x more usage than Basic');
    expect(row(views, 'max').usage).toBe('5x more usage than Pro');
    expect(row(views, 'max_15x').usage).toBe(
      '20x more usage per session than Pro, 10x more weekly usage than Pro',
    );
    expect(row(views, 'team').usage).toBe('Same usage as Pro for every seat');
    expect(row(views, 'free').usage).toBe('A small allowance, free models only');
    expect(row(views, 'enterprise').usage).toBe('Usage set by your contract');
    for (const view of views) expect(view.usage).not.toMatch(/\$|USD|token|credits/iu);
  });

  it('shows what every plan includes when the account plan is unknown', () => {
    const views = planComparisonViews(undefined);

    for (const plan of ['free', ...SELF_SERVE_PAID_PLAN_TIERS, 'enterprise'] as BillingPlanTier[]) {
      expect(row(views, plan).features).toBe(`Includes: ${includedLabels(plan)}`);
    }
  });

  it('marks the account plan and compares every other plan against it', () => {
    const views = planComparisonViews('pro');
    const pro = row(views, 'pro');

    expect(pro).toMatchObject({ label: 'Pro (your plan)', current: true });
    expect(pro.features).toBe(`Includes: ${includedLabels('pro')}`);
    expect(views.filter((view) => view.current)).toHaveLength(1);

    expect(row(views, 'max_15x').features).toBe(
      `Adds over Pro: ${BILLING_PLAN_CAPABILITY_LABELS.video_generation}`,
    );
    expect(row(views, 'team').features).toBe(
      `Adds over Pro: ${BILLING_PLAN_CAPABILITY_LABELS.team_admin}`,
    );
    expect(row(views, 'max').features).toBe('No features beyond Pro');
    expect(row(views, 'basic').features).toBe('No features beyond Pro');
    expect(row(views, 'free').features).toBe('No features beyond Pro');
  });

  it('names what a higher plan adds, never a capability the account already has', () => {
    const views = planComparisonViews('basic');
    const proAdds = row(views, 'pro').features;

    expect(proAdds).toMatch(/^Adds over Basic: /u);
    expect(proAdds).toContain(BILLING_PLAN_CAPABILITY_LABELS.developer_surfaces);
    expect(proAdds).not.toContain(BILLING_PLAN_CAPABILITY_LABELS.managed_chat);
  });

  it('does not mark a plan the comparison does not list as the account plan', () => {
    for (const plan of ['byok', 'local-only', 'not-a-plan']) {
      const views = planComparisonViews(plan);
      expect(
        views.some((view) => view.current),
        plan,
      ).toBe(false);
      expect(row(views, 'free').features).toBe(`Includes: ${includedLabels('free')}`);
    }
  });
});
