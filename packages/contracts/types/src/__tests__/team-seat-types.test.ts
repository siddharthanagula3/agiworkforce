import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  DEFAULT_TEAM_SEAT_TYPE,
  SELF_SERVE_PAID_PLAN_TIERS,
  TEAM_SEAT_PLAN_TIERS,
  TEAM_SEAT_TYPES,
  billingIntervalsForPlan,
  billingPlanCapabilities,
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  getBillingPlanProductLimits,
  getNextUpgradeTier,
  getPlanPriceCents,
  getPlanPriceInr,
  getPublishedPlanPricePerMonthUsd,
  isBillingPlanTier,
  isPerSeatBillingPlan,
  isPlanSelectableOnSurface,
  isSelfServePaidPlanTier,
  isTeamPlanTier,
  isTeamSeatType,
  isTeamSeatUpgradeTier,
  normalizeBillingPlanTier,
  normalizeTeamSeatType,
  subscriptionPlanTierOf,
  teamSeatPlanTier,
  teamSeatTypeOfPlan,
  totalTeamSeats,
  type BillingPlanCapability,
} from '../billing-catalog';
import {
  BILLING_PLAN_CATALOG_VERSION,
  isPlanOnSale,
  planCatalogEntry,
  resolvePurchasablePlan,
} from '../billing-plan-catalog';
import {
  MANAGED_USAGE_LIMITS,
  MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION,
  getPlanCreditAllowance,
  managedUsageComparisonLines,
  managedUsageMultiplier,
  resolvePlanCatalogVersion,
} from '../managed-usage-limits';
import { normalizeSubscriptionAccessTier } from '../model-catalog';
import { normalizeUIPlanTier, tierAtLeast } from '../design-system/user-identity';
import { listPlansForProduct, toProduct } from '../product-plan';

const PREMIUM = TEAM_SEAT_PLAN_TIERS.premium;
const STANDARD = TEAM_SEAT_PLAN_TIERS.standard;

describe('Team seat types', () => {
  it('sells two seat types and defaults a seat to Standard', () => {
    expect(TEAM_SEAT_TYPES).toEqual(['standard', 'premium']);
    expect(DEFAULT_TEAM_SEAT_TYPE).toBe('standard');
    expect(teamSeatPlanTier('standard')).toBe('team');
    expect(teamSeatPlanTier('premium')).toBe('team_premium');
  });

  it('reads the seat type back from the tier a seat entitles', () => {
    expect(teamSeatTypeOfPlan(STANDARD)).toBe('standard');
    expect(teamSeatTypeOfPlan(PREMIUM)).toBe('premium');
    for (const plan of ['free', 'pro', 'max', 'enterprise', '', null, undefined]) {
      expect(teamSeatTypeOfPlan(plan)).toBeNull();
    }
  });

  it('treats an unknown stored seat type as Standard, never as Premium', () => {
    expect(isTeamSeatType('premium')).toBe(true);
    expect(isTeamSeatType('Premium')).toBe(false);
    for (const value of ['', 'gold', 'PREMIUM', null, undefined, 1]) {
      expect(normalizeTeamSeatType(value)).toBe('standard');
    }
    expect(normalizeTeamSeatType('premium')).toBe('premium');
  });

  it('adds the seats of both types into one seat count', () => {
    expect(totalTeamSeats({ standard: 3, premium: 2 })).toBe(5);
  });
});

describe('Premium seat price', () => {
  it('charges 125 dollars a seat monthly and 1,200 dollars a seat yearly', () => {
    expect(getPlanPriceCents(PREMIUM, 'monthly')).toBe(12_500);
    expect(getPlanPriceCents(PREMIUM, 'yearly')).toBe(120_000);
    expect(getPublishedPlanPricePerMonthUsd(PREMIUM, 'yearly')).toBe(100);
    expect(billingIntervalsForPlan(PREMIUM)).toEqual(billingIntervalsForPlan(STANDARD));
  });

  it('is billed per seat like the Standard seat it sits beside', () => {
    expect(isPerSeatBillingPlan(PREMIUM)).toBe(true);
    expect(toProduct(PREMIUM)).toMatchObject({ audience: 'workspace', perSeat: true });
  });

  it('publishes no rupee price, because none has been set', () => {
    expect(getPlanPriceInr(PREMIUM)).toBeNull();
    expect(listPlansForProduct(PREMIUM).map((plan) => plan.currency)).toEqual(['usd', 'usd']);
  });

  it('leaves the Standard seat price where it was', () => {
    expect(getPlanPriceCents(STANDARD, 'monthly')).toBe(2_500);
    expect(getPlanPriceCents(STANDARD, 'yearly')).toBe(24_000);
  });
});

describe('Premium seat entitlement', () => {
  it('carries the Max 5x usage allowance, five times a Standard seat', () => {
    expect(MANAGED_USAGE_LIMITS[PREMIUM]).toEqual(MANAGED_USAGE_LIMITS.max);
    expect(getPlanCreditAllowance(PREMIUM)).toEqual(getPlanCreditAllowance('max'));
    expect(managedUsageMultiplier(PREMIUM, STANDARD)).toBe(5);
    expect(managedUsageComparisonLines(PREMIUM)).toEqual([
      `5x more usage than ${BILLING_PLAN_PRICING.team.label} for every seat`,
    ]);
  });

  it('carries the Max 5x product limits, not a copy of them', () => {
    expect(getBillingPlanProductLimits(PREMIUM)).toBe(getBillingPlanProductLimits('max'));
    expect(getBillingPlanProductLimits(STANDARD)).not.toEqual(getBillingPlanProductLimits('max'));
  });

  it('opens the models a Max 5x subscriber can use', () => {
    expect(normalizeSubscriptionAccessTier(PREMIUM)).toBe(normalizeSubscriptionAccessTier('max'));
    expect(normalizeSubscriptionAccessTier(STANDARD)).not.toBe(
      normalizeSubscriptionAccessTier('max'),
    );
  });

  it('keeps every Team capability, team administration included', () => {
    const standard = billingPlanCapabilities(STANDARD);
    const premium = billingPlanCapabilities(PREMIUM);
    expect(premium).toEqual(standard);
    expect(canUseBillingPlanCapability(PREMIUM, 'team_admin')).toBe(true);
    for (const capability of billingPlanCapabilities('max')) {
      expect(canUseBillingPlanCapability(PREMIUM, capability)).toBe(true);
    }
  });

  it('is never listed beside a capability without the Standard seat', () => {
    for (const capability of Object.keys(
      BILLING_PLAN_CAPABILITY_TIERS,
    ) as BillingPlanCapability[]) {
      const tiers = BILLING_PLAN_CAPABILITY_TIERS[capability];
      expect(tiers.includes(PREMIUM)).toBe(tiers.includes(STANDARD));
    }
  });

  it('ranks with Max 5x in the client tier order', () => {
    expect(normalizeUIPlanTier(PREMIUM)).toBe(PREMIUM);
    expect(tierAtLeast(PREMIUM, 'max')).toBe(true);
    expect(tierAtLeast(STANDARD, 'max')).toBe(false);
  });
});

describe('a Premium seat is a seat, not a plan', () => {
  it('is a catalogue tier nobody can check out for', () => {
    expect(isBillingPlanTier(PREMIUM)).toBe(true);
    expect(isTeamSeatUpgradeTier(PREMIUM)).toBe(true);
    expect(isTeamSeatUpgradeTier(STANDARD)).toBe(false);
    expect(SELF_SERVE_PAID_PLAN_TIERS as readonly string[]).not.toContain(PREMIUM);
    expect(isSelfServePaidPlanTier(PREMIUM)).toBe(false);
    expect(planCatalogEntry(PREMIUM).sellability).toBe('seat_upgrade');
    expect(isPlanOnSale(PREMIUM)).toBe(false);
    expect(resolvePurchasablePlan(PREMIUM)).toBeNull();
    expect(toProduct(PREMIUM).selfServeSellable).toBe(false);
  });

  it('is billed on the Team subscription, so the subscription stays on Team', () => {
    expect(subscriptionPlanTierOf(PREMIUM)).toBe('team');
    expect(subscriptionPlanTierOf(STANDARD)).toBe('team');
    expect(subscriptionPlanTierOf('max')).toBe('max');
  });

  it('counts as a Team tier and offers no individual upgrade', () => {
    expect(isTeamPlanTier(PREMIUM)).toBe(true);
    expect(isTeamPlanTier(STANDARD)).toBe(true);
    expect(isTeamPlanTier('max')).toBe(false);
    expect(getNextUpgradeTier(PREMIUM)).toBeNull();
  });

  it('is named by its plan, not as a plan of its own, where plans are listed', () => {
    expect(billingPlanCapabilityPlanLabels('team_admin')).toBe(
      `${BILLING_PLAN_PRICING.team.label} and ${BILLING_PLAN_PRICING.enterprise.label}`,
    );
  });

  it('survives normalization and is selectable where Team is', () => {
    expect(normalizeBillingPlanTier('TEAM_PREMIUM')).toBe(PREMIUM);
    expect(isPlanSelectableOnSurface(PREMIUM, 'web')).toBe(true);
  });
});

describe('catalogue version', () => {
  it('moves on for the new seat type and keeps the allowances of earlier catalogues', () => {
    expect(BILLING_PLAN_CATALOG_VERSION).toBe(3);
    for (const version of [1, 2, BILLING_PLAN_CATALOG_VERSION]) {
      expect(resolvePlanCatalogVersion(version)).toBe(version);
      expect(MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION[version]?.team).toEqual(
        MANAGED_USAGE_LIMITS.team,
      );
    }
  });
});
