import { ENTITLED_SUBSCRIPTION_STATUSES, isEntitledSubscriptionStatus } from '@agiworkforce/types';

export const WEBHOOK_MAX_RETRIES = 3;

export const WEBHOOK_RETRY_BASE_DELAY_MS = 100;

export const ACTIVE_SUBSCRIPTION_STATUSES = ENTITLED_SUBSCRIPTION_STATUSES;

export function isActiveSubscriptionStatus(status: string): boolean {
  return isEntitledSubscriptionStatus(status);
}
