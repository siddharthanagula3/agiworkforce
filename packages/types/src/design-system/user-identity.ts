// packages/types/src/design-system/user-identity.ts

/**
 * Pricing tiers per the LOCKED 2026-05-07 decision matrix.
 * Named UIPlanTier to distinguish from the legacy Tauri PlanTier in tauri.ts.
 *
 * Sequence: Local + BYOK free forever. Hobby ($10) is the entry paid tier;
 * Pro ($29.99) is waitlisted; Pro+ ($49.99) is next paid launch and gates
 * the multi-provider in-thread switch differentiator. Max ($299.99) tops out.
 */
export type UIPlanTier = 'local' | 'byok' | 'hobby' | 'pro' | 'pro_plus' | 'max';

export const PLAN_LABEL: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local',
  byok: 'BYOK',
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
});

export const PLAN_DESCRIPTION: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local-only — Ollama / LMStudio',
  byok: 'Bring your own keys',
  hobby: 'Managed cloud, basic models',
  pro: 'Pro — coming soon',
  pro_plus: 'Pro+ — multi-provider chat, every flagship',
  max: 'Max — coming soon',
});

/** True for tiers that are free forever — never gate the tool on these. */
export function isFreePlan(tier: UIPlanTier): boolean {
  return tier === 'local' || tier === 'byok';
}

/**
 * True for tiers that include the multi-provider in-thread switch
 * differentiator (Pro+ exclusive feature). Used by ModelSelector + chat
 * runtime to gate the cross-provider continuity flow.
 */
export function canSwitchProviderInThread(tier: UIPlanTier): boolean {
  return tier === 'pro_plus' || tier === 'max';
}

/** Strict tier ordering for upgrade-path comparisons. */
const TIER_ORDER: Readonly<Record<UIPlanTier, number>> = Object.freeze({
  local: 0,
  byok: 1,
  hobby: 2,
  pro: 3,
  pro_plus: 4,
  max: 5,
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
