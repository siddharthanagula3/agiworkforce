import {
  getPlanTrialDays,
  normalizeBillingPlanTier,
  toEntitlement,
  type BillingPlanTier,
  type Entitlement,
} from '@agiworkforce/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialStatus = 'none' | 'active' | 'expired';

/**
 * A trial is the trialed plan's entitlement with an end date, not a plan of its
 * own. Modelling it as a tier would fork the catalog: every limit and
 * capability would have to be restated for a state that lasts days.
 */
export interface TrialEntitlement {
  status: TrialStatus;
  trialedPlan: BillingPlanTier;
  entitlement: Entitlement;
  startedAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
}

export function trialEndsAt(startedAtMs: number, trialDays: number): string {
  return new Date(startedAtMs + trialDays * DAY_MS).toISOString();
}

/**
 * What a trialist is entitled to right now. An expired trial falls back to the
 * free plan's entitlement rather than keeping the trialed one, which is the
 * failure the Stripe `trial_period_days` field alone never expressed: Stripe
 * ends the trial, but nothing here said what the account was entitled to in the
 * window between that and the first payment.
 */
export function resolveTrialEntitlement(input: {
  trialedPlan: string | null | undefined;
  startedAt: string | null;
  endsAt: string | null;
  now: number;
}): TrialEntitlement {
  const trialedPlan = normalizeBillingPlanTier(input.trialedPlan);
  if (input.startedAt === null || input.endsAt === null) {
    return {
      status: 'none',
      trialedPlan,
      entitlement: toEntitlement('free'),
      startedAt: null,
      endsAt: null,
      daysRemaining: null,
    };
  }

  const endsAtMs = Date.parse(input.endsAt);
  if (!Number.isFinite(endsAtMs)) {
    return {
      status: 'none',
      trialedPlan,
      entitlement: toEntitlement('free'),
      startedAt: input.startedAt,
      endsAt: input.endsAt,
      daysRemaining: null,
    };
  }

  const active = endsAtMs > input.now;
  return {
    status: active ? 'active' : 'expired',
    trialedPlan,
    entitlement: toEntitlement(active ? trialedPlan : 'free'),
    startedAt: input.startedAt,
    endsAt: input.endsAt,
    daysRemaining: active ? Math.ceil((endsAtMs - input.now) / DAY_MS) : 0,
  };
}

/**
 * `trialDays` is what `resolveCheckoutTrialDays` granted for this checkout, not
 * the catalog default: eligibility depends on the customer's history, so a plan
 * offering a trial does not mean this buyer gets one.
 */
export function startTrial(input: {
  trialedPlan: string | null | undefined;
  trialDays: number | null;
  startedAtMs: number;
}): { trialedPlan: BillingPlanTier; startedAt: string; endsAt: string } | null {
  const trialedPlan = normalizeBillingPlanTier(input.trialedPlan);
  if (input.trialDays === null || input.trialDays <= 0) return null;
  if (getPlanTrialDays(trialedPlan) === null) return null;
  return {
    trialedPlan,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endsAt: trialEndsAt(input.startedAtMs, input.trialDays),
  };
}
