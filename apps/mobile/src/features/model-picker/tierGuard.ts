/**
 * tierGuard — mobile-local provider-switch gate.
 *
 * Mirrors the logic of unified-chat's `selectProviderSwitchGate` selector.
 * Lives here (rather than unified-chat-rn) because unified-chat-rn does not
 * exist yet — Phase C will extract and share this.
 *
 * Rule: switching to a different provider mid-thread requires `max` or higher
 * on this surface (see `PROVIDER_SWITCH_MIN_TIER`).
 * Canonical Auto selections are provider-agnostic and never trigger the gate.
 * An identical provider switch is always allowed.
 *
 * CANONICAL ALIGNMENT (2026-08-05, MOBILE-PROVIDER-SWITCH-GATE-DIVERGENCE-01) —
 * this guard now delegates to the shared `canSwitchProviderInThread()` in
 * `packages/contracts/types/src/design-system/user-identity.ts`, which admits
 * only `max` / `max_15x` / `enterprise` and denies `pro` / `team`. Mobile maps
 * `enterprise` / `max_15x` → `max` in {@link mapBillingPlanToUIPlan}, so the
 * mapped gate admits exactly those canonical tiers. This matches web, desktop,
 * and the VS Code guard (`apps/extension-vscode/src/integrations/
 * providerSwitchGuard.ts`). The prior `pro`-tier divergence is closed.
 *
 * Contract drift fix (2026-05-08): the guard now operates on the canonical
 * {@link UIPlanTier}. Mobile still persists a {@link BillingPlanTier}
 * for display labels and compatibility with older installs. Call
 * {@link mapBillingPlanToUIPlan} at the boundary.
 */

import {
  type BillingPlanTier,
  type UIPlanTier,
  canSwitchProviderInThread,
  isAutoModeModelId,
} from '@agiworkforce/types';

export type ProviderSwitchDecision = 'allow' | 'upgrade-required';

/**
 * Map the persisted {@link BillingPlanTier} (used by `tierStore` and the
 * `/api/me` payload) to the canonical {@link UIPlanTier} used by every gate
 * decision across the platform.
 *
 * Mapping rules:
 *   - `local-only` → `local`        (renamed in canonical contract)
 *   - legacy direct-provider tiers → `local` on Mobile
 *   - `free`       → `local`        (Mobile demo starts from local access)
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
      return 'local';
    case 'free':
      return 'local';
    case 'basic':
      return 'local';
    case 'pro':
      return 'pro';
    case 'team':
      return 'pro';
    case 'max':
    case 'max_15x':
      return 'max';
    case 'enterprise':
      return 'max';
    default: {
      const _exhaustive: never = plan;
      void _exhaustive;
      return 'local';
    }
  }
}

const PROVIDER_SWITCH_MIN_TIER: UIPlanTier = 'max';

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
 *  - Either value is a canonical Auto selection (Auto switches are free)
 *  - The user's mapped tier passes the canonical `canSwitchProviderInThread`
 *    gate (max / max_15x / enterprise)
 *
 * Returns 'upgrade-required' otherwise.
 */
export function guardProviderSwitch(
  currentProvider: string | null,
  nextProvider: string,
  tier: BillingPlanTier,
): ProviderSwitchDecision {
  if (currentProvider === null) return 'allow';

  if (isAutoModeModelId(currentProvider) || isAutoModeModelId(nextProvider)) return 'allow';

  if (currentProvider === nextProvider) return 'allow';

  void PROVIDER_SWITCH_MIN_TIER;
  const uiTier = mapBillingPlanToUIPlan(tier);
  if (canSwitchProviderInThread(uiTier)) return 'allow';

  return 'upgrade-required';
}
