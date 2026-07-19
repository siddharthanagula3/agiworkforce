import { BILLING_PLAN_PRICING, type BillingPlanTier } from '../billing-catalog';

/**
 * Pricing tiers per the current billing catalog (packages/contracts/types/src/billing-catalog.ts).
 * Named UIPlanTier to distinguish from the legacy Tauri PlanTier in tauri.ts.
 *
 * The UI uses `local` for the billing catalog's `local-only` identifier. All
 * managed tiers remain distinct so an unknown value can never relabel a
 * Managed Cloud session as BYOK.
 */
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
  local: 'Local LLMs — Ollama / LM Studio',
  byok: 'Local app with your own provider keys',
  free: 'Managed Cloud chat with free usage',
  basic: 'Cloud Managed, basic models',
  pro: 'Pro — balanced models, higher usage',
  max: 'Max 5x — flagship models and higher usage',
  max_15x: 'Max 15x — flagship models and the highest individual usage',
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

/** True for tiers that are free forever — never gate the tool on these. */
export function isFreePlan(tier: UIPlanTier): boolean {
  return tier === 'local' || tier === 'byok' || tier === 'free';
}

/**
 * True for tiers that include the multi-provider in-thread switch
 * differentiator. Used by ModelSelector + chat runtime to gate the
 * cross-provider continuity flow.
 */
export function canSwitchProviderInThread(tier: UIPlanTier): boolean {
  return tier === 'max' || tier === 'max_15x' || tier === 'enterprise';
}

/** Strict tier ordering for upgrade-path comparisons. */
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

/** True iff `actual` meets or exceeds `required`. */
export function tierAtLeast(actual: UIPlanTier, required: UIPlanTier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[required];
}

/**
 * Usage meter shown in profile popover.
 * Managed-plan users see hosted usage; BYOK users see their own key's limits (when known);
 * Local users see no meter.
 */
export interface UsageMeter {
  /** 0–1, percentage of quota remaining. Null = no meter applies (Local mode). */
  remaining: number | null;
  /** ISO timestamp of next quota reset. Null when unbounded. */
  resetsAt: string | null;
  /** Tokens used in the active billing window when reported by the source. */
  usedTokens?: number;
  /** Token allowance for the active billing window when reported by the source. */
  limitTokens?: number;
  /** Whose limit this is — affects framing in the UI. */
  source: 'managed-plan' | 'user-api-key' | 'unbounded';
}

/** Identity surfaced everywhere user-context is shown. */
export interface UserIdentity {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  plan: UIPlanTier;
  /** Optional — null for Local users not signed in. */
  usage: UsageMeter | null;
}
