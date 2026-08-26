export const DEFAULT_PAIRING_TTL_SECONDS = 300;

export const DEFAULT_HOST = '0.0.0.0';

export const DEFAULT_PORT = 4000;

export const DEFAULT_WS_PATH = '/ws';

export const MAX_MESSAGE_SIZE_BYTES = 64 * 1024;

export const MAX_SDP_SIZE = 100_000;

export const MAX_ICE_CANDIDATE_SIZE = 500;

export const MAX_SDP_MID_SIZE = 50;

export const MAX_SDP_MLINE_INDEX = 100;

export const MAX_USERNAME_FRAGMENT_SIZE = 100;

export const MAX_CONTROL_PAYLOAD_SIZE = 4096;

export const MAX_ACTION_NAME_SIZE = 50;

export const PAIRING_CODE_LENGTH = 12;

export const CODE_GENERATION_MAX_ATTEMPTS = 10;

export const SESSION_CLEANUP_INTERVAL_MS = 30_000;

export const MAX_PENDING_REHYDRATIONS = 1000;

export const PENDING_REHYDRATION_TTL_MS = 30_000;

export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

export const RATE_LIMIT_PAIRING_CREATE = 10;

export const RATE_LIMIT_PAIRING_LOOKUP = 60;

export const RATE_LIMIT_PAIRING_DELETE = 10;

export const RATE_LIMIT_HEALTH_CHECK = 100;

export const MAX_CONNECTIONS_PER_IP = 10;

export const TRUSTED_PROXY_HOPS_DEFAULT = 1;

export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const STALE_CONNECTION_CHECK_INTERVAL_MS = 60_000;

export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

export const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000',
] as const;

export const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
} as const;

export const WS_CONNECTION_LIMIT_DEFAULT = 10;

export const WS_MESSAGE_LIMIT_DEFAULT = 100;

export const WS_RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;

export const WS_BLACKLIST_DURATION_MS_DEFAULT = 300_000;

export const WS_BLACKLIST_THRESHOLD_DEFAULT = 5;

export const PAIRING_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${PAIRING_CODE_LENGTH}}$`);

export const MAX_METADATA_SIZE_BYTES = 4096;

export const MAX_METADATA_KEYS = 20;

export const SESSION_LONG_TTL_MS = 24 * 60 * 60 * 1000;

export const STALE_SESSION_HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

export const MAX_PENDING_APPROVALS_PER_SESSION = 50;

export const PENDING_APPROVAL_TTL_MS = 10 * 60 * 1000;

export const MAX_AUTH_FAILURES_DEFAULT = 10;

export const AUTH_LOCKOUT_DURATION_MS_DEFAULT = 900_000;

export const RATE_LIMIT_METRICS = 30;

export const RATE_LIMIT_ADMIN = 20;
