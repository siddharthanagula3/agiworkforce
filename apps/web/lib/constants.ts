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

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

/** Rate limit window duration (1 minute) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Rate limit retry-after duration in seconds */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

// Endpoint-specific rate limits
export const RATE_LIMITS = {
  /** Pairing creation - strict to prevent enumeration attacks */
  PAIRING_CREATE: 10,
  /** Pairing lookup - read-only operations */
  PAIRING_LOOKUP: 60,
  /** Pairing deletion - destructive operation */
  PAIRING_DELETE: 10,
  /** Health check - lenient for monitoring */
  HEALTH_CHECK: 100,
} as const;

// =============================================================================
// Signaling Server Configuration
// =============================================================================

/** Default TTL for pairing codes (5 minutes) */
export const DEFAULT_PAIRING_TTL_SECONDS = 300;

/** Maximum message size for WebSocket messages (64KB) */
export const MAX_MESSAGE_SIZE_BYTES = 64 * 1024;

/** Maximum SDP size (100KB) - SDP can be large with many candidates */
export const MAX_SDP_SIZE = 100_000;

/** Maximum ICE candidate string size */
export const MAX_ICE_CANDIDATE_SIZE = 500;

/** Maximum SDP MID size */
export const MAX_SDP_MID_SIZE = 50;

/** Maximum SDP MLine index */
export const MAX_SDP_MLINE_INDEX = 100;

/** Maximum username fragment size */
export const MAX_USERNAME_FRAGMENT_SIZE = 100;

/** Maximum control payload size (4KB) */
export const MAX_CONTROL_PAYLOAD_SIZE = 4096;

/** Maximum action name size */
export const MAX_ACTION_NAME_SIZE = 50;

/** Pairing code length */
export const PAIRING_CODE_LENGTH = 8;

/** Session cleanup interval (30 seconds) */
export const SESSION_CLEANUP_INTERVAL_MS = 30_000;

/** Maximum pending rehydrations */
export const MAX_PENDING_REHYDRATIONS = 1000;

/** Pending rehydration TTL (30 seconds) */
export const PENDING_REHYDRATION_TTL_MS = 30_000;

/** Maximum attempts for code generation */
export const CODE_GENERATION_MAX_ATTEMPTS = 10;

// =============================================================================
// Plan Hierarchy
// =============================================================================

export const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
} as const;

/**
 * Get the hierarchy level for a plan tier.
 * @param plan - The plan tier name
 * @returns The hierarchy level (0-4), defaults to 0 for unknown plans
 */
export function getPlanLevel(plan: string): number {
  return PLAN_HIERARCHY[plan.toLowerCase()] ?? 0;
}

// =============================================================================
// Pricing Display Configuration
// =============================================================================

export const PRICING = {
  hobby: {
    monthly: 10,
    yearly: 4.99,
    yearlyTotal: 59.88,
  },
  pro: {
    monthly: 29.99,
    yearly: 24.99,
    yearlyTotal: 299.88,
  },
  max: {
    monthly: 299.99,
    yearly: 249.99,
    yearlyTotal: 2999.88,
  },
} as const;

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

// =============================================================================
// Default CORS Origins
// =============================================================================

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000',
] as const;

// =============================================================================
// Database Error Codes
// =============================================================================

export const DB_ERROR_CODES = {
  /** PostgreSQL unique constraint violation */
  UNIQUE_VIOLATION: '23505',
  /** PostgREST no rows returned */
  NO_ROWS: 'PGRST116',
} as const;
