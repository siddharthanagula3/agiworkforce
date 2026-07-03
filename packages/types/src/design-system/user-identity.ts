// packages/types/src/design-system/user-identity.ts

/**
 * Pricing tiers per the current billing catalog (packages/types/src/billing-catalog.ts).
 * Named UIPlanTier to distinguish from the legacy Tauri PlanTier in tauri.ts.
 *
 * 2026-07-02: 'hobby' renamed to 'basic' (now $8/mo, ₹399/mo India — see
 * BILLING_PLAN_PRICING), 'pro_plus' removed with no successor (it was never
 * shipped as a real tier). `canSwitchProviderInThread` below, which used to
 * gate on `pro_plus`, now gates on `max` only — the most-restrictive choice
 * consistent with the removal, since no tier was designated to inherit that
 * gate. Sequence: Local + BYOK free forever, then Basic → Pro → Max.
 */
export type UIPlanTier = 'local' | 'byok' | 'basic' | 'pro' | 'max';

export const PLAN_LABEL: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local Mode',
  byok: 'Local Mode + BYOK',
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
});

export const PLAN_DESCRIPTION: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local LLMs — Ollama / LM Studio',
  byok: 'Local app with your own provider keys',
  basic: 'Cloud Managed, basic models',
  pro: 'Pro — balanced models, higher usage',
  max: 'Max — flagship models, highest usage',
});

/** True for tiers that are free forever — never gate the tool on these. */
export function isFreePlan(tier: UIPlanTier): boolean {
  return tier === 'local' || tier === 'byok';
}

/**
 * True for tiers that include the multi-provider in-thread switch
 * differentiator. Used by ModelSelector + chat runtime to gate the
 * cross-provider continuity flow.
 */
export function canSwitchProviderInThread(tier: UIPlanTier): boolean {
  return tier === 'max';
}

/** Strict tier ordering for upgrade-path comparisons. */
const TIER_ORDER: Readonly<Record<UIPlanTier, number>> = Object.freeze({
  local: 0,
  byok: 1,
  basic: 2,
  pro: 3,
  max: 4,
});

/** True iff `actual` meets or exceeds `required`. */
export function tierAtLeast(actual: UIPlanTier, required: UIPlanTier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[required];
}

/**
 * Usage meter shown in profile popover.
 * Hobby+ users see managed-plan limits; BYOK users see their own key's limits (when known);
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
