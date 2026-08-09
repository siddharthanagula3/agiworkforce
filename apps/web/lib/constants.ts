/**
 * Centralized constants for the web application.
 * This file consolidates magic numbers and configuration values
 * to improve maintainability and consistency.
 */

// =============================================================================
// Stripe Webhook Configuration
// =============================================================================

/** Maximum retries for credit allocation in webhook handlers */
export const WEBHOOK_MAX_RETRIES = 3;

/** Base delay for exponential backoff in webhook retries (100ms) */
export const WEBHOOK_RETRY_BASE_DELAY_MS = 100;

// NOTE: A `PLAN_HIERARCHY`/`getPlanLevel` pair lived here but was DEAD CODE
// (zero consumers repo-wide) and drifted from the real tier model — it lacked
// `basic` and predated the pricing update. The canonical tier ordering is
// `TIER_ORDER`/`tierAtLeast` in `@agiworkforce/types` design-system/user-identity,
// and billing plan tiers are the SSOT in
// `@agiworkforce/types` billing-catalog. Removed 2026-07-10 to avoid a stale,
// misleading second hierarchy.

// =============================================================================
// Subscription Status
// =============================================================================

/** Subscription statuses considered as active */
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
