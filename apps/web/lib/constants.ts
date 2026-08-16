

export const WEBHOOK_MAX_RETRIES = 3;

export const WEBHOOK_RETRY_BASE_DELAY_MS = 100;

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

/**
 * Check if a subscription status is considered active.
 * @param status - The subscription status to check
 * @returns True if the status is considered active
 */
export function isActiveSubscriptionStatus(status: string): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(
    status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number],
  );
}
