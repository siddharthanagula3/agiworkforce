// packages/types/src/design-system/user-identity.ts

/**
 * Pricing tiers per MEMORY.md "Pricing Model (locked, per 2026-05-03 decision)".
 * Named UIPlanTier to distinguish from the legacy Tauri PlanTier in tauri.ts.
 */
export type UIPlanTier = 'local' | 'byok' | 'hobby' | 'pro' | 'max';

export const PLAN_LABEL: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local',
  byok: 'BYOK',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
});

export const PLAN_DESCRIPTION: Readonly<Record<UIPlanTier, string>> = Object.freeze({
  local: 'Local-only — Ollama / LMStudio',
  byok: 'Bring your own keys',
  hobby: 'Managed cloud, basic models',
  pro: 'Pro — coming soon',
  max: 'Max — coming soon',
});

/** True for tiers that are free forever — never gate the tool on these. */
export function isFreePlan(tier: UIPlanTier): boolean {
  return tier === 'local' || tier === 'byok';
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
