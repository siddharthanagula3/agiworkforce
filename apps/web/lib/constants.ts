import { ENTITLED_SUBSCRIPTION_STATUSES, isEntitledSubscriptionStatus } from '@agiworkforce/types';

export const ACTIVE_SUBSCRIPTION_STATUSES = ENTITLED_SUBSCRIPTION_STATUSES;

export function isActiveSubscriptionStatus(status: string): boolean {
  return isEntitledSubscriptionStatus(status);
}
