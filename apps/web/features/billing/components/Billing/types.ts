import type { BillingPlanTier } from '@agiworkforce/types';

export type PlanTier = Exclude<BillingPlanTier, 'local-only' | 'byok'>;

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
  usage: { usedPercent: number };
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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(
    amount,
  );
}
