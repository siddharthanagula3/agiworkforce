export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;

const STRIPE_REQUEST_TIMEOUT_MS = 8_000;
const STRIPE_MAX_NETWORK_RETRIES = 1;

export const STRIPE_CLIENT_OPTIONS = {
  apiVersion: STRIPE_API_VERSION,
  timeout: STRIPE_REQUEST_TIMEOUT_MS,
  maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
} as const;
