/**
 * Managed-compute usage ceilings — the ONE definition both surfaces read.
 *
 * This lived in `apps/web/lib/server/managed-usage-policy.ts` behind
 * `import 'server-only'`, which made it unreachable from `services/api-gateway`.
 * The gateway therefore called the legacy `reserve_managed_usage_request(...)`
 * with no ceilings at all, while apps/web called
 * `reserve_managed_usage_request_with_limits(...)` with all three — so desktop,
 * CLI and the VS Code extension enforced no rolling five-hour, weekly or
 * flagship limit whatsoever. The capped SQL function is a wrapper that
 * delegates to the legacy one after checking, so the gateway was literally
 * "the same reservation, minus every cap".
 *
 * It is a contract two surfaces must agree on, so it belongs here next to
 * `billing-catalog.ts` rather than inside one app. `apps/web` re-exports every
 * symbol, so nothing there changed.
 *
 * These values are PRIVATE. They must never be serialized into pricing, usage
 * or client configuration responses; public clients get percentages and reset
 * times only.
 */
import type { BillingInterval, BillingPlanTier } from './billing-catalog';

interface ManagedUsageLimit {
  monthlyUnits: number;
  weeklyUnits: number;
  fiveHourUnits: number;
  dailyUnits: number;
  /**
   * GOV-1: explicit "this tier has NO configured spend ceiling" marker.
   *
   * Before this flag every tier expressed "no cap" and "cap of zero" with the
   * same value (0), and the SQL guard `p_*_cap_cents > 0` turned that single
   * value into UNLIMITED. That inverted fail-closed: Enterprise (an all-zero
   * row) had no rolling ceiling at all on the only durable usage gate.
   *
   * The two states are now distinct and the DEFAULT IS DENY:
   *   unlimited: true  -> cap resolves to null -> SQL treats it as no ceiling
   *   unlimited: false -> cap resolves to a number; 0 means "deny every
   *                       reservation against this ledger", not "unlimited"
   */
  unlimited: boolean;
}

/**
 * A resolved rolling/period ceiling in paid-ledger cents.
 * `null` = explicitly uncapped (negotiated contract). A number is a hard
 * ceiling, and 0 denies every reservation.
 */
export type ManagedUsageCapCents = number | null;

/**
 * GOV-2: ledger allocation used for tiers whose contract carries no numeric
 * monthly allowance (Enterprise). The paid ledger still needs a real account —
 * `CreditService.checkAvailable` returns false without one, which hard-blocked
 * every Enterprise chat with "Usage budget exhausted. Upgrade your plan".
 *
 * This is HEADROOM, NOT A PRICE OR A SPEND CEILING: an uncapped tier's actual
 * governor is its negotiated contract plus the rolling caps above (which
 * resolve to null for it). It exists only so the cents ledger has an account
 * to debit against.
 */
export const MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS = 100_000_000;

/**
 * Private managed-compute allowances. These values must never be serialized
 * into pricing, usage, or client configuration responses. Public clients get
 * percentages and reset times only.
 */
const MANAGED_USAGE_LIMITS: Readonly<Record<BillingPlanTier, ManagedUsageLimit>> = Object.freeze({
  // Local trust boundary: never admitted to managed compute. Zero WITHOUT the
  // unlimited marker now means deny, which is what these tiers must get.
  'local-only': {
    monthlyUnits: 0,
    weeklyUnits: 0,
    fiveHourUnits: 0,
    dailyUnits: 0,
    unlimited: false,
  },
  byok: { monthlyUnits: 0, weeklyUnits: 0, fiveHourUnits: 0, dailyUnits: 0, unlimited: false },
  // Free's allowance is real but lives in the separate micro-USD reservation
  // ledger; against the PAID cents ledger its cap is 0 = deny.
  free: { monthlyUnits: 20, weeklyUnits: 15, fiveHourUnits: 5, dailyUnits: 0, unlimited: false },
  basic: {
    monthlyUnits: 400,
    weeklyUnits: 100,
    fiveHourUnits: 20,
    dailyUnits: 0,
    unlimited: false,
  },
  pro: {
    monthlyUnits: 2_000,
    weeklyUnits: 500,
    fiveHourUnits: 100,
    dailyUnits: 0,
    unlimited: false,
  },
  max: {
    monthlyUnits: 10_000,
    weeklyUnits: 2_500,
    fiveHourUnits: 500,
    dailyUnits: 0,
    unlimited: false,
  },
  max_15x: {
    monthlyUnits: 30_000,
    weeklyUnits: 7_500,
    fiveHourUnits: 1_500,
    dailyUnits: 0,
    unlimited: false,
  },
  team: {
    monthlyUnits: 2_000,
    weeklyUnits: 500,
    fiveHourUnits: 100,
    dailyUnits: 0,
    unlimited: false,
  },
  // Negotiated contract: DELIBERATELY uncapped, declared rather than inferred
  // from a zero. Its spend governor is the contract, not this table.
  enterprise: {
    monthlyUnits: 0,
    weeklyUnits: 0,
    fiveHourUnits: 0,
    dailyUnits: 0,
    unlimited: true,
  },
});

const INTERNAL_USAGE_UNITS_PER_LEDGER_CENT = 2;
const MICROUSD_PER_INTERNAL_USAGE_UNIT = 5_000;
const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

/** Convert private server ledger values to the only public numeric usage value. */
export function toPublicUsagePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  const boundedUsed = Math.min(limit, Math.max(0, used));
  return Math.round((boundedUsed / limit) * 10_000) / 100;
}

function getLimit(plan: string | null | undefined): ManagedUsageLimit | null {
  if (!plan) return null;
  const normalized = plan.trim().toLowerCase() as BillingPlanTier;
  return Object.prototype.hasOwnProperty.call(MANAGED_USAGE_LIMITS, normalized)
    ? MANAGED_USAGE_LIMITS[normalized]
    : null;
}

export function getPlanMonthlyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.monthlyUnits ?? 0;
}

export function getPlanWeeklyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.weeklyUnits ?? 0;
}

export function getPlanDailyUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.dailyUnits ?? 0;
}

export function getPlanFiveHourUsageUnits(plan: string | null | undefined): number {
  return getLimit(plan)?.fiveHourUnits ?? 0;
}

export function getPlanMonthlyUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanMonthlyUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getPlanWeeklyUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanWeeklyUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getPlanFiveHourUsageBudgetMicrousd(plan: string | null | undefined): number {
  return getPlanFiveHourUsageUnits(plan) * MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

export function getInternalUsageUnitMicrousd(): number {
  return MICROUSD_PER_INTERNAL_USAGE_UNIT;
}

function unitsToLedgerCents(units: number): number {
  if (units <= 0) return 0;
  if (units % INTERNAL_USAGE_UNITS_PER_LEDGER_CENT !== 0) {
    throw new Error('Managed usage allocation cannot be represented by the paid cents ledger');
  }
  return units / INTERNAL_USAGE_UNITS_PER_LEDGER_CENT;
}

/** GOV-1: whether `plan` is declared as having no configured spend ceiling. */
export function isPlanUsageUncapped(plan: string | null | undefined): boolean {
  return getLimit(plan)?.unlimited === true;
}

/**
 * Paid billing-period allocation for the existing cents ledger.
 *
 * GOV-2: an uncapped tier resolves to real ledger headroom instead of 0, so
 * `allocateCreditsForPeriod` actually creates its credit account and
 * `CreditService.checkAvailable` stops 402-ing the highest-paying tier.
 */
export function getPlanUsageBudgetCents(
  plan: string | null | undefined,
  _interval: BillingInterval = 'monthly',
): number {
  if (isPlanUsageUncapped(plan)) return MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS;
  // Free is metered in the separate micro-USD reservation ledger because its
  // five-hour and weekly allocations contain half-cent units.
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanMonthlyUsageUnits(plan));
}

export function getPlanWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanWeeklyUsageUnits(plan));
}

export function getPlanSessionUsageBudgetCents(plan: string | null | undefined): number {
  if (getLimit(plan) === MANAGED_USAGE_LIMITS.free) return 0;
  return unitsToLedgerCents(getPlanFiveHourUsageUnits(plan));
}

export function getPlanFlagshipWeeklyUsageBudgetCents(plan: string | null | undefined): number {
  return Math.round(getPlanWeeklyUsageBudgetCents(plan) * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO);
}

/**
 * GOV-1: the rolling ceilings actually handed to SQL.
 *
 * `null` is passed only for a tier that DECLARES itself uncapped; every other
 * tier — including one whose numeric allowance is 0 — gets a number, and the
 * migration's `is not null` guard turns 0 into a denial instead of a bypass.
 */
export function getPlanSessionUsageCapCents(plan: string | null | undefined): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanSessionUsageBudgetCents(plan);
}

export function getPlanWeeklyUsageCapCents(plan: string | null | undefined): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanWeeklyUsageBudgetCents(plan);
}

export function getPlanFlagshipWeeklyUsageCapCents(
  plan: string | null | undefined,
): ManagedUsageCapCents {
  return isPlanUsageUncapped(plan) ? null : getPlanFlagshipWeeklyUsageBudgetCents(plan);
}
