import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  PLAN_CREDIT_ALLOWANCES,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  creditAmount,
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

function windowCredits(plan: BillingPlanTier): string {
  const allowance = PLAN_CREDIT_ALLOWANCES[plan];
  return [allowance.fiveHour, allowance.weekly, allowance.monthly].map(creditAmount).join(' / ');
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

  it('states each plan in credits per 5 hours, week and month', () => {
    const views = planComparisonViews(null);

    expect(row(views, 'pro').credits).toBe(
      `${windowCredits('pro')} credits per 5 hours / week / month`,
    );
    expect(row(views, 'max_15x').credits).toBe(
      `${windowCredits('max_15x')} credits per 5 hours / week / month`,
    );
    expect(row(views, 'free').credits).toBe(
      `${windowCredits('free')} credits per 5 hours / week / month, free models only`,
    );
    expect(row(views, 'team').credits).toBe(
      `${windowCredits('team')} credits per 5 hours / week / month per seat`,
    );
    expect(row(views, 'enterprise').credits).toBe('Usage set by your contract');
    for (const view of views) expect(view.credits).not.toMatch(/\$|USD|token/iu);
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
