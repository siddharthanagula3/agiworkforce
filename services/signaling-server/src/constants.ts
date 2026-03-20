/**
 * Centralized constants for the signaling server.
 * This file consolidates magic numbers and configuration values
 * to improve maintainability and consistency.
 */

// =============================================================================
// Server Configuration
// =============================================================================

/** Default TTL for pairing codes (5 minutes) */
export const DEFAULT_PAIRING_TTL_SECONDS = 300;

/** Default server host */
export const DEFAULT_HOST = '0.0.0.0';

/** Default server port */
export const DEFAULT_PORT = 4000;

/** Default WebSocket path */
export const DEFAULT_WS_PATH = '/ws';

// =============================================================================
// Message Size Limits
// =============================================================================

/** Maximum WebSocket message size (64KB - SDPs can be large with many candidates) */
export const MAX_MESSAGE_SIZE_BYTES = 64 * 1024;

/** Maximum SDP size (100KB) */
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

// =============================================================================
// Pairing Configuration
// =============================================================================

/** Pairing code length (8 characters) */
export const PAIRING_CODE_LENGTH = 8;

/** Maximum attempts for code generation */
export const CODE_GENERATION_MAX_ATTEMPTS = 10;

// =============================================================================
// Session Management
// =============================================================================

/** Session cleanup interval (30 seconds) */
export const SESSION_CLEANUP_INTERVAL_MS = 30_000;

/** Maximum pending rehydrations to prevent memory leaks */
export const MAX_PENDING_REHYDRATIONS = 1000;

/** Pending rehydration TTL (30 seconds) */
export const PENDING_REHYDRATION_TTL_MS = 30_000;

// =============================================================================
// Rate Limiting
// =============================================================================

/** Rate limit window duration (1 minute) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Rate limit retry-after duration in seconds */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

/** Rate limit for pairing creation (10/min) - strict to prevent enumeration */
export const RATE_LIMIT_PAIRING_CREATE = 10;

/** Rate limit for pairing lookup (60/min) - read-only operations */
export const RATE_LIMIT_PAIRING_LOOKUP = 60;

/** Rate limit for pairing deletion (10/min) - destructive operation */
export const RATE_LIMIT_PAIRING_DELETE = 10;

/** Rate limit for health check (100/min) - lenient for monitoring */
export const RATE_LIMIT_HEALTH_CHECK = 100;

// =============================================================================
// Connection Management
// =============================================================================

/** Maximum connections allowed per IP address */
export const MAX_CONNECTIONS_PER_IP = 10;

/** Idle connection timeout (5 minutes) */
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Interval for checking stale connections (1 minute) */
export const STALE_CONNECTION_CHECK_INTERVAL_MS = 60_000;

// =============================================================================
// Graceful Shutdown
// =============================================================================

/** Maximum time to wait for graceful shutdown (30 seconds) */
export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

/** Time to wait for pending operations during shutdown (5 seconds) */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

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
} as const;

// =============================================================================
// WebSocket Security
// =============================================================================

/** Maximum connections per IP per window */
export const WS_CONNECTION_LIMIT_DEFAULT = 10;

/** Maximum messages per IP per window */
export const WS_MESSAGE_LIMIT_DEFAULT = 100;

/** WebSocket rate limit window duration (1 minute) */
export const WS_RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;

/** Blacklist duration (5 minutes) */
export const WS_BLACKLIST_DURATION_MS_DEFAULT = 300_000;

/** Number of violations before blacklisting */
export const WS_BLACKLIST_THRESHOLD_DEFAULT = 5;

// =============================================================================
// Input Validation
// =============================================================================

/** Valid pairing code pattern (8 alphanumeric characters) */
export const PAIRING_CODE_PATTERN = /^[A-Z0-9]{8}$/;

/** Maximum metadata object size in bytes */
export const MAX_METADATA_SIZE_BYTES = 4096;

/** Maximum number of keys in metadata object */
export const MAX_METADATA_KEYS = 20;

// =============================================================================
// Session Resilience
// =============================================================================

/** Default long-lived session TTL (24 hours) — used after initial pairing handshake */
export const SESSION_LONG_TTL_MS = 24 * 60 * 60 * 1000;

/** Stale session threshold: remove sessions without heartbeat for >5 minutes */
export const STALE_SESSION_HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

/** Maximum pending approvals stored per session while mobile is disconnected */
export const MAX_PENDING_APPROVALS_PER_SESSION = 50;

/** TTL for pending approvals before they expire (10 minutes) */
export const PENDING_APPROVAL_TTL_MS = 10 * 60 * 1000;

// =============================================================================
// Admin Endpoints
// =============================================================================

/** Maximum failed auth attempts before lockout */
export const MAX_AUTH_FAILURES_DEFAULT = 10;

/** Auth lockout duration (15 minutes) */
export const AUTH_LOCKOUT_DURATION_MS_DEFAULT = 900_000;

/** Rate limit for metrics endpoint (30/min) */
export const RATE_LIMIT_METRICS = 30;

/** Rate limit for admin endpoints (20/min) */
export const RATE_LIMIT_ADMIN = 20;
