import 'server-only';

import {
  canAccessModelForSubscriptionTier,
  isAutoModeModelId,
  normalizeSubscriptionAccessTier,
} from '@agiworkforce/types';

/**
 * Server adapter for the shared subscription-model policy.
 *
 * Model membership and tier inheritance are owned by the generated registry;
 * this file deliberately contains no model IDs or parallel tier partitions.
 */
export function canAccessModel(model: string, subscriptionTier: string): boolean {
  if (isAutoModeModelId(model)) {
    return normalizeSubscriptionAccessTier(subscriptionTier) !== 'free';
  }

  return canAccessModelForSubscriptionTier(model, subscriptionTier);
}
