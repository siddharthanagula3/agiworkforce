import { describe, expect, it } from 'vitest';

import {
  canUseBillingPlanCapability,
  getTierPolicy,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { buildMeCapabilityHandshake } from '@/lib/services/capability-handshake-service';

/**
 * What a plan is TOLD it has must match what the plan gate will actually let it
 * do. Two tables answered that question and disagreed, because they do not have
 * the same resolution: `TIER_POLICIES` is keyed on four buckets, and
 * `normalizeProductTier` folds max_15x into max and basic into pro, so it is
 * structurally incapable of telling those plans apart.
 * `BILLING_PLAN_CAPABILITY_TIERS` names all seven, and it is what the pricing
 * page derives its Video and Image columns from, so it is what the customer was
 * sold.
 *
 * The concrete failure: a Max subscriber was told, in `/api/me`, that they had
 * 300 video seconds a month, and `/api/media/video/generate` then answered with
 * a paywall naming Max 15x and Enterprise. Nothing asserted `max` in either
 * table's tests, which is exactly where the two crossed.
 */
const CUSTOMER_PLANS: readonly BillingPlanTier[] = [
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'enterprise',
];

function limitIds(plan: BillingPlanTier): string[] {
  const document = buildMeCapabilityHandshake({
    userId: 'user_plan_agreement',
    tier: plan,
    surface: 'web',
    cloudExecutionDeploymentEnabled: true,
  });
  return document.limits.map((limit) => limit.id);
}

describe('what a plan is told it has agrees with what it may do', () => {
  it.each(CUSTOMER_PLANS)('video seconds are published to %s only if it may generate', (plan) => {
    const published = limitIds(plan).includes('video_seconds_per_month');

    expect(published).toBe(
      canUseBillingPlanCapability(plan, 'video_generation') &&
        getTierPolicy(plan).videoSecondsPerMonth != null,
    );
  });

  it.each(CUSTOMER_PLANS)('image quota is published to %s only if it may generate', (plan) => {
    const published = limitIds(plan).includes('images_per_month');

    expect(published).toBe(
      canUseBillingPlanCapability(plan, 'image_generation') &&
        getTierPolicy(plan).imageQuotaPerMonth != null,
    );
  });

  /** The exact pair that contradicted each other in production. */
  it('does not promise video to Max, which the video route paywalls', () => {
    expect(canUseBillingPlanCapability('max', 'video_generation')).toBe(false);
    expect(limitIds('max')).not.toContain('video_seconds_per_month');
  });

  it('still promises video to the plan that bought a metered amount of it', () => {
    expect(canUseBillingPlanCapability('max_15x', 'video_generation')).toBe(true);
    expect(limitIds('max_15x')).toContain('video_seconds_per_month');
  });

  /**
   * Enterprise may generate video and carries no published second count,
   * because its amount is contractual rather than a plan constant. Absent is
   * the honest answer there; a number would be invented.
   */
  it('grants enterprise video without inventing a quota for it', () => {
    expect(canUseBillingPlanCapability('enterprise', 'video_generation')).toBe(true);
    expect(getTierPolicy('enterprise').videoSecondsPerMonth ?? null).toBeNull();
    expect(limitIds('enterprise')).not.toContain('video_seconds_per_month');
  });

  /** Basic inherits Pro's policy through the fold, and the image route refuses it. */
  it('does not promise image generation to Basic, which the image route paywalls', () => {
    expect(canUseBillingPlanCapability('basic', 'image_generation')).toBe(false);
    expect(limitIds('basic')).not.toContain('images_per_month');
  });

  /**
   * A limit nobody applies is worse than no limit: a client can ration itself
   * against it. Nothing has ever counted against the flagship daily cap and no
   * request has ever been refused by it.
   */
  it.each(CUSTOMER_PLANS)('publishes no unenforced flagship day cap to %s', (plan) => {
    expect(limitIds(plan)).not.toContain('flagship_tokens_per_day');
  });

  it('still publishes the limits that are real', () => {
    expect(limitIds('pro')).toContain('managed_usage_billing_period_cents');
  });
});
