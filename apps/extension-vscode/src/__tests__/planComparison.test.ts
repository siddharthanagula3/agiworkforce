import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  BILLING_PLAN_PRICING,
  PLAN_CREDIT_ALLOWANCES,
  billingPlanCapabilities,
  billingPlanCapabilitiesAddedOver,
  creditAmount,
  type BillingPlanTier,
} from '@agiworkforce/types';
import {
  COMPARED_PLANS,
  planComparisonRows,
  planCreditsPhrase,
} from '../features/account-auth/planComparison';

function labelsOf(capabilities: readonly (keyof typeof BILLING_PLAN_CAPABILITY_LABELS)[]): string {
  return capabilities.map((capability) => BILLING_PLAN_CAPABILITY_LABELS[capability]).join(', ');
}

function windowsOf(plan: BillingPlanTier): string {
  const allowance = PLAN_CREDIT_ALLOWANCES[plan];
  return `${creditAmount(allowance.fiveHour)} / ${creditAmount(allowance.weekly)} / ${creditAmount(allowance.monthly)} credits per 5 hours / week / month`;
}

describe('plan comparison', () => {
  it('compares Free, every self-serve paid plan and Enterprise in catalog order', () => {
    expect(COMPARED_PLANS).toEqual([
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'enterprise',
    ]);
    expect(planComparisonRows(null).map((row) => row.label)).toEqual(
      COMPARED_PLANS.map((plan) => BILLING_PLAN_PRICING[plan].label),
    );
    expect(planComparisonRows(null).find((row) => row.plan === 'max_15x')?.label).toBe('Max 20x');
  });

  it('states each plan in credits per window, never in dollars', () => {
    expect(planCreditsPhrase('pro')).toBe(windowsOf('pro'));
    expect(planCreditsPhrase('max_15x')).toBe(windowsOf('max_15x'));
    expect(planCreditsPhrase('free')).toBe(`${windowsOf('free')}, free models only`);
    expect(planCreditsPhrase('team')).toBe(`${windowsOf('team')} per seat`);
    expect(planCreditsPhrase('enterprise')).toBe('Usage set by your contract');
    for (const plan of COMPARED_PLANS) expect(planCreditsPhrase(plan)).not.toContain('$');
  });

  it('lists what each plan includes when the current plan is unknown', () => {
    const rows = planComparisonRows(undefined);

    expect(rows.some((row) => row.current)).toBe(false);
    for (const row of rows) {
      expect(row.features).toBe(`Includes: ${labelsOf(billingPlanCapabilities(row.plan))}`);
    }
  });

  it('marks the current plan and states what every other plan adds over it', () => {
    const rows = planComparisonRows('pro');
    const byPlan = new Map(rows.map((row) => [row.plan, row]));

    expect(rows.filter((row) => row.current).map((row) => row.plan)).toEqual(['pro']);
    expect(byPlan.get('pro')?.features).toBe(`Includes: ${labelsOf(billingPlanCapabilities('pro'))}`);
    expect(byPlan.get('max_15x')?.features).toBe(
      `Adds over Pro: ${BILLING_PLAN_CAPABILITY_LABELS.video_generation}`,
    );
    expect(byPlan.get('team')?.features).toBe(
      `Adds over Pro: ${BILLING_PLAN_CAPABILITY_LABELS.team_admin}`,
    );
    expect(byPlan.get('basic')?.features).toBe('No features beyond Pro');
    expect(byPlan.get('free')?.features).toBe('No features beyond Pro');
    expect(byPlan.get('enterprise')?.features).toBe(
      `Adds over Pro: ${labelsOf(billingPlanCapabilitiesAddedOver('enterprise', 'pro'))}`,
    );
  });

  it('names the $200 plan by its catalog label when it is the one compared against', () => {
    const rows = planComparisonRows('max_15x');

    expect(rows.find((row) => row.plan === 'enterprise')?.features).toMatch(/^Adds over Max 20x: /u);
    expect(rows.find((row) => row.plan === 'max')?.features).toBe('No features beyond Max 20x');
  });

  it('ignores a tier the comparison does not list rather than marking the wrong row', () => {
    const rows = planComparisonRows('byok');

    expect(rows.some((row) => row.current)).toBe(false);
    expect(rows.every((row) => row.features.startsWith('Includes: '))).toBe(true);
  });
});
