import {
  type BillingPlanTier,
  type UIPlanTier,
  canSwitchProviderInThread,
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
    case 'team_premium':
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

export function guardProviderSwitch(
  currentProvider: string | null,
  nextProvider: string,
  tier: BillingPlanTier,
): ProviderSwitchDecision {
  if (currentProvider === null) return 'allow';
  if (currentProvider === nextProvider) return 'allow';
  return canSwitchProviderInThread(mapBillingPlanToUIPlan(tier)) ? 'allow' : 'upgrade-required';
}
