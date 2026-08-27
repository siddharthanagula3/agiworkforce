export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;

/**
 * Left unset, the SDK waits 80 seconds for a response. Several call sites hold
 * a pooled Postgres client while they wait — the webhook opens a transaction
 * and makes up to four Stripe retrieves inside it — so a slow Stripe hour
 * turned into Postgres client starvation for traffic that never touched
 * billing at all: `assertAccountActive` runs on every cookie-authenticated
 * request against the same pool, and it is fail-closed.
 *
 * Bounded well below every route's own duration budget, with one retry so a
 * single dropped connection is still transparent.
 */
const STRIPE_REQUEST_TIMEOUT_MS = 8_000;
const STRIPE_MAX_NETWORK_RETRIES = 1;

export const STRIPE_CLIENT_OPTIONS = {
  apiVersion: STRIPE_API_VERSION,
  timeout: STRIPE_REQUEST_TIMEOUT_MS,
  maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
} as const;
