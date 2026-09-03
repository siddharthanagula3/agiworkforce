import {
  type BillingPlanTier,
  type UIPlanTier,
  canSwitchProviderInThread,
  isAutoModeModelId,
} from '@agiworkforce/types';

export type ProviderSwitchDecision = 'allow' | 'upgrade-required';

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
