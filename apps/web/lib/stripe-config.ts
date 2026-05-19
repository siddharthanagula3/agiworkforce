/**
 * Shared Stripe configuration constants.
 *
 * All files that instantiate the Stripe SDK MUST import STRIPE_API_VERSION from
 * here to avoid version drift across webhook, checkout, and subscription-service.
 */

export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;
