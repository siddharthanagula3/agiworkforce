import 'server-only';

import {
  canAccessModelForSubscriptionTier,
  isAutoModeModelId,
  normalizeSubscriptionAccessTier,
} from '@agiworkforce/types';

export function canAccessModel(model: string, subscriptionTier: string): boolean {
  if (isAutoModeModelId(model)) {
    return normalizeSubscriptionAccessTier(subscriptionTier) !== 'free';
  }

  return canAccessModelForSubscriptionTier(model, subscriptionTier);
}
