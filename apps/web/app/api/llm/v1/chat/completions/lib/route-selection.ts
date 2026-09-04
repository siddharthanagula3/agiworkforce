import { modelRegistry } from '@agiworkforce/model-registry';
import type { RoutingTaskType } from '@agiworkforce/types';

const PREMIUM_PROFILE = 'premium';
const BALANCED_PROFILE = 'balanced';

export const PREMIUM_PROFILE_CONFIDENCE_FLOOR = 0.7;

interface AutoAliasPolicy {
  profile: string;
  computeProfile?: boolean;
}

interface AutoAliasPolicyView {
  aliases: Record<string, AutoAliasPolicy>;
  autoProfileByTask?: Partial<Record<RoutingTaskType, string>>;
}

const autoPolicy = modelRegistry.policies.auto as unknown as AutoAliasPolicyView;

const balancedAlias =
  Object.entries(autoPolicy.aliases).find(
    ([, alias]) => !alias.computeProfile && alias.profile === BALANCED_PROFILE,
  )?.[0] ?? null;

export function demoteLowConfidencePremiumSelection(
  selection: string,
  taskType: RoutingTaskType,
  confidence: number,
): string {
  const alias = autoPolicy.aliases[selection.toLowerCase()];
  if (!alias?.computeProfile || !balancedAlias) return selection;
  if (autoPolicy.autoProfileByTask?.[taskType] !== PREMIUM_PROFILE) return selection;
  return confidence < PREMIUM_PROFILE_CONFIDENCE_FLOOR ? balancedAlias : selection;
}
