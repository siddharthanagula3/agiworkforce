import type { BillingPlanTier } from '@agiworkforce/types';

// pro_plus removed 2026-06-20; 'hobby' renamed to 'basic' 2026-07-02.
// The tier vocabulary is the shared billing catalog's, not a second one:
// `normalizePlan` answers 'free' for anything it has not heard of, so a tier
// checkout already sells would show its own subscriber the Free plan.
// 'local-only' and 'byok' are excluded on purpose — they are separate trust
// boundaries with no managed subscription row to render here.
export type PlanTier = Exclude<BillingPlanTier, 'local-only' | 'byok'>;

// Keyed by PlanTier so the compiler, not a reviewer, checks the list against
// the catalog: a billable tier added there fails to build until it is listed
// here, instead of reaching this screen as an unknown that normalizes to Free.
// The keys, not the catalog object, are read at runtime — this module is
// imported by components whose tests mock @agiworkforce/types wholesale, so it
// must stay a type-only consumer of the contract.
const BILLABLE_PLAN_TIERS: Record<PlanTier, true> = {
  free: true,
  basic: true,
  pro: true,
  max: true,
  max_15x: true,
  team: true,
  enterprise: true,
};

export const VALID_PLANS = Object.keys(BILLABLE_PLAN_TIERS) as readonly PlanTier[];

export const VALID_STATUSES = [
  'active',
  'trialing',
  'canceled',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
  'none',
] as const;
export type BillingStatus = (typeof VALID_STATUSES)[number];

export function isValidPlan(plan: unknown): plan is PlanTier {
  return typeof plan === 'string' && VALID_PLANS.includes(plan as PlanTier);
}

export function isValidStatus(status: unknown): status is BillingStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as BillingStatus);
}

export function normalizePlan(plan: unknown): PlanTier {
  return isValidPlan(plan) ? plan : 'free';
}

export function normalizeStatus(status: unknown): BillingStatus {
  if (status === 'cancelled') return 'canceled';
  return isValidStatus(status) ? status : 'none';
}

export interface BillingInfo {
  plan: PlanTier;
  status: BillingStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  price: number | null;
  currency: string | null;
  features: string[];
  usage: {
    usedPercent: number;
  };
  invoices: {
    id: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
    download_url: string;
  }[];
}

const VALID_CURRENCY_RE = /^[A-Z]{3}$/;

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number, currency: string) {
  const safeCurrency = VALID_CURRENCY_RE.test(currency) ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
  }).format(amount);
}
