import { BILLING_PLAN_PRICING, type BillingPlanTier } from '../billing-catalog';

export type UIPlanTier = 'local' | Exclude<BillingPlanTier, 'local-only'>;

export const PLAN_LABEL: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: BILLING_PLAN_PRICING['local-only'].label,
  byok: BILLING_PLAN_PRICING.byok.label,
  free: BILLING_PLAN_PRICING.free.label,
  basic: BILLING_PLAN_PRICING.basic.label,
  pro: BILLING_PLAN_PRICING.pro.label,
  max: BILLING_PLAN_PRICING.max.label,
  max_15x: BILLING_PLAN_PRICING.max_15x.label,
  team: BILLING_PLAN_PRICING.team.label,
  enterprise: BILLING_PLAN_PRICING.enterprise.label,
});

export const PLAN_DESCRIPTION: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local LLMs, Ollama / LM Studio',
  byok: 'Local app with your own provider keys',
  free: 'Managed Cloud chat with free usage',
  basic: 'Cloud Managed, basic models',
  pro: 'Pro, balanced models, higher usage',
  max: 'Max 5x, flagship models and higher usage',
  max_15x: 'Max 15x, flagship models and the highest individual usage',
  team: 'Pro capabilities with shared team administration',
  enterprise: 'Managed controls and negotiated enterprise capabilities',
});

export function normalizeUIPlanTier(
  value: string | null | undefined,
  fallback: UIPlanTier = 'byok',
): UIPlanTier {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'local' || normalized === 'local-only') return 'local';
  if (normalized === 'hobby') return 'basic';
  if (normalized === 'pro_plus' || normalized === 'pro+') return 'max';
  if (normalized in BILLING_PLAN_PRICING && normalized !== 'local-only') {
    return normalized as Exclude<BillingPlanTier, 'local-only'>;
  }
  return fallback;
}

export function isFreePlan(tier: UIPlanTier): boolean {
  return tier === 'local' || tier === 'byok' || tier === 'free';
}

export function canSwitchProviderInThread(tier: UIPlanTier): boolean {
  return tier === 'max' || tier === 'max_15x' || tier === 'enterprise';
}

const TIER_ORDER: Readonly<Record<UIPlanTier, number>> = Object.freeze({
  local: 0,
  byok: 0,
  free: 0,
  basic: 1,
  pro: 2,
  team: 2,
  max: 3,
  max_15x: 4,
  enterprise: 5,
});

export function tierAtLeast(actual: UIPlanTier, required: UIPlanTier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[required];
}

export interface UsageMeter {
  remaining: number | null;
  resetsAt: string | null;
  usedTokens?: number;
  limitTokens?: number;
  source: 'managed-plan' | 'user-api-key' | 'unbounded';
}

export interface UserIdentity {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  plan: UIPlanTier;
  usage: UsageMeter | null;
}
