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
 *
 * Contract drift fix (2026-05-08): the guard now operates on the canonical
 * {@link UIPlanTier} (6 values: local | byok | hobby | pro | pro_plus | max).
 * Mobile still persists a {@link BillingPlanTier} (8 values, dash-separated)
 * for display labels — call {@link mapBillingPlanToUIPlan} at the boundary.
 */

import { type BillingPlanTier, type UIPlanTier, tierAtLeast } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by `guardProviderSwitch`. */
export type ProviderSwitchDecision = 'allow' | 'upgrade-required';

// ---------------------------------------------------------------------------
// BillingPlanTier → UIPlanTier mapping
// ---------------------------------------------------------------------------

/**
 * Map the persisted {@link BillingPlanTier} (8 values, used by `tierStore` and
 * the `/api/me` payload) to the canonical {@link UIPlanTier} (6 values, used
 * by every gate decision across the platform).
 *
 * Mapping rules:
 *   - `local-only` → `local`        (renamed in canonical contract)
 *   - `free`       → `byok`         (free tier surfaces as BYOK in UI)
 *   - `enterprise` → `max`          (enterprise users get max gates)
 *   - everything else passes through unchanged.
 *
 * Mobile keeps `BillingPlanTier` strings in MMKV so older installs continue to
 * rehydrate correctly. Renaming `local-only` → `local` would invalidate every
 * persisted tier — that's why we map at the boundary instead.
 */
export function mapBillingPlanToUIPlan(plan: BillingPlanTier): UIPlanTier {
  switch (plan) {
    case 'local-only':
      return 'local';
    case 'byok':
      return 'byok';
    case 'free':
      // Free tier exposes BYOK gates (no managed cloud, no provider switch).
      return 'byok';
    case 'hobby':
      return 'hobby';
    case 'pro':
      return 'pro';
    case 'pro_plus':
      return 'pro_plus';
    case 'max':
      return 'max';
    case 'enterprise':
      // Enterprise gets the highest gate set; Max is the highest UIPlanTier.
      return 'max';
    default: {
      // Exhaustiveness check — if a new BillingPlanTier value is added, the
      // compiler will surface it here. Default fallback is the most-restrictive
      // BYOK gate.
      const _exhaustive: never = plan;
      void _exhaustive;
      return 'byok';
    }
  }
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/** The minimum UIPlanTier required to switch providers mid-thread. */
const PROVIDER_SWITCH_MIN_TIER: UIPlanTier = 'pro_plus';

/**
 * Determine whether a user may switch providers mid-thread.
 *
 * @param currentProvider  The provider of the model currently used in this
 *                         conversation, or null if the conversation is new /
 *                         no messages have been sent yet.
 * @param nextProvider     The provider of the model the user wants to switch to.
 * @param tier             The user's current subscription tier (BillingPlanTier
 *                         as persisted in `tierStore`). Mapped internally to
 *                         {@link UIPlanTier} before the gate check.
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

  // Cross-provider switch: map to UIPlanTier and gate against pro_plus minimum.
  const uiTier = mapBillingPlanToUIPlan(tier);
  if (tierAtLeast(uiTier, PROVIDER_SWITCH_MIN_TIER)) return 'allow';

  return 'upgrade-required';
}
