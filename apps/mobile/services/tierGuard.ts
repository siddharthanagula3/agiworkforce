/**
 * tierGuard — mobile-local provider-switch gate.
 *
 * Mirrors the logic of unified-chat's `selectProviderSwitchGate` selector.
 * Lives here (rather than unified-chat-rn) because unified-chat-rn does not
 * exist yet — Phase C will extract and share this.
 *
 * Rule: switching to a different provider mid-thread requires Pro+ or higher.
 * Auto-modes (ids starting with "auto-") are provider-agnostic and never
 * trigger the gate.  An identical provider switch is always allowed.
 */

import type { BillingPlanTier } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by `guardProviderSwitch`. */
export type ProviderSwitchDecision = 'allow' | 'upgrade-required';

// ---------------------------------------------------------------------------
// Tier ordering
// ---------------------------------------------------------------------------

/**
 * Ordered list of tiers from lowest to highest.
 * Used to determine whether a given tier meets the Pro+ threshold.
 */
const TIER_ORDER: BillingPlanTier[] = [
  'local-only',
  'byok',
  'free',
  'hobby',
  'pro',
  'pro_plus',
  'max',
  'enterprise',
];

/** The minimum tier required to switch providers mid-thread. */
const PROVIDER_SWITCH_MIN_TIER: BillingPlanTier = 'pro_plus';

function tierIndex(tier: BillingPlanTier): number {
  const idx = TIER_ORDER.indexOf(tier);
  // Unknown tier treated as free (most restrictive)
  return idx === -1 ? TIER_ORDER.indexOf('free') : idx;
}

function meetsMinimumTier(tier: BillingPlanTier, minimum: BillingPlanTier): boolean {
  return tierIndex(tier) >= tierIndex(minimum);
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * Determine whether a user may switch providers mid-thread.
 *
 * @param currentProvider  The provider of the model currently used in this
 *                         conversation, or null if the conversation is new /
 *                         no messages have been sent yet.
 * @param nextProvider     The provider of the model the user wants to switch to.
 * @param tier             The user's current subscription tier.
 *
 * Returns 'allow' when:
 *  - There is no established conversation provider (new thread)
 *  - The next provider is the same as the current provider
 *  - Either provider id starts with "auto-" (auto-mode switches are free)
 *  - The user has Pro+ or higher
 *
 * Returns 'upgrade-required' otherwise.
 */
export function guardProviderSwitch(
  currentProvider: string | null,
  nextProvider: string,
  tier: BillingPlanTier,
): ProviderSwitchDecision {
  // No established provider — new conversation, always allow.
  if (currentProvider === null) return 'allow';

  // Auto-mode ids are provider-agnostic.
  if (currentProvider.startsWith('auto-') || nextProvider.startsWith('auto-')) return 'allow';

  // Same provider — no cross-provider switch.
  if (currentProvider === nextProvider) return 'allow';

  // Cross-provider switch: require Pro+.
  if (meetsMinimumTier(tier, PROVIDER_SWITCH_MIN_TIER)) return 'allow';

  return 'upgrade-required';
}
