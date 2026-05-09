/**
 * Worker protocol types for the outbound-worker direction-inversion layer.
 *
 * Workers (CLI / desktop / mobile) register with the cloud gateway; the
 * cloud assigns work via JSON-RPC over WebSocket.  The inbound bridge
 * (port 8787 desktop WS) remains live for the 30-day backward-compat
 * window.
 *
 * Reference: tasks/research/deep/net-bridge-remote-server.md §2.1
 * Reference: tasks/research/gap-matrix/services-gateway-signaling.md §3.1
 */

// ---------------------------------------------------------------------------
// WorkSecret envelope
// ---------------------------------------------------------------------------

/** Version must equal 1 — reject any other value to block downgrade attacks. */
export const WORK_SECRET_VERSION = 1 as const;

/**
 * WorkSecret envelope: base64url-encoded JSON, version-pinned.
 * The server mints this after a worker registers.
 * Workers MUST verify `version === WORK_SECRET_VERSION` before accepting work.
 *
 * Citation: net-bridge-remote-server.md §2.1 `workSecret.ts:30-50`.
 */
export interface WorkSecret {
  version: typeof WORK_SECRET_VERSION;
  /** Opaque session-ingress JWT that the worker uses for ack/heartbeat. */
  session_ingress_token: string;
  /** Base URL for LLM / CCR calls inside this work unit. */
  api_base_url: string;
  /** Extra CLI args to forward to the worker process (optional). */
  claude_code_args?: string[];
  /** MCP server configuration blob (optional). */
  mcp_config?: unknown;
  /** Additional environment variables the worker should set (optional). */
  environment_variables?: Record<string, string>;
  /** When true the worker should use the code-sessions v2 path. */
  use_code_sessions?: boolean;
  /** Expiry (Unix seconds). Workers must reject expired secrets. */
  expires_at: number;
}

// ---------------------------------------------------------------------------
// Auth ladder
// ---------------------------------------------------------------------------

/**
 * 4-tier auth ladder for worker endpoints.
 * Each tier has its own lifecycle; they are NOT interchangeable.
 *
 * Tier 1 — OAuth Bearer:    Used for initial environment registration.
 * Tier 2 — environment_secret: Used for work-poll long-polls.
 * Tier 3 — session_ingress JWT: Used for ack / heartbeat inside a work unit.
 * Tier 4 — X-Trusted-Device-Token: Sent alongside Tier 1/3 for enrolled devices.
 *
 * Citation: net-bridge-remote-server.md §2.1 `bridgeApi.ts:76-89`.
 */
export type AuthTier = 'oauth_bearer' | 'environment_secret' | 'session_ingress' | 'trusted_device';

// ---------------------------------------------------------------------------
// Worker registration / lifecycle
// ---------------------------------------------------------------------------

export type WorkerType = 'cli' | 'desktop' | 'mobile' | 'custom';

export type WorkerStatus = 'available' | 'busy' | 'offline';

/** Persisted row in `worker_registrations` table. */
export interface WorkerRegistration {
  id: string;
  user_id: string;
  worker_type: WorkerType;
  platform: string;
  version: string;
  /**
   * Monotonically increasing per-worker counter.  Every `/bridge` call
   * bumps this server-side.  A JWT-only credential swap that does NOT
   * rebuild the transport 409s within 20 s on the next heartbeat.
   * Citation: net-bridge-remote-server.md §2.1 `codeSessionApi.ts:93-168`.
   */
  worker_epoch: number;
  environment_id: string;
  environment_secret_hash: string;
  trusted_device_token_hash: string | null;
  status: WorkerStatus;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Work units
// ---------------------------------------------------------------------------

export type WorkUnitStatus = 'pending' | 'assigned' | 'completed' | 'failed' | 'reassigned';

export interface WorkUnit {
  id: string;
  environment_id: string;
  worker_id: string | null;
  status: WorkUnitStatus;
  work_secret_envelope: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Idempotency key supplied by the assigning client. */
  idempotency_key: string | null;
}

// ---------------------------------------------------------------------------
// JSON-RPC over WebSocket
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: '2.0';
  result: T;
  id: string | number;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_OFFLINE_THRESHOLD_MS = 90_000;

// ---------------------------------------------------------------------------
// Step-up auth
// ---------------------------------------------------------------------------

/**
 * When the gateway returns HTTP 403 with body `{ code: 'insufficient_scope' }`
 * the caller must NOT attempt a token refresh (refresh cannot elevate scope,
 * RFC 6749 §6).  Instead, initiate a fresh PKCE authorization flow.
 *
 * Citation: net-bridge-remote-server.md §2.1 `auth.ts:1354-1374`.
 */
export interface StepUpRequired {
  code: 'insufficient_scope';
  required_scope: string;
  pkce_redirect_url: string;
}

// ---------------------------------------------------------------------------
// Header extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract a single string value from an IncomingMessage header that may be
 * `string | string[] | undefined`.  Returns the first value or undefined.
 */
export function headerString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Extract a single string value from an Express route param that may be
 * `string | string[]` (per ParamsDictionary in @types/express v5).
 * Returns the first value or undefined.
 */
export function paramString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

// ---------------------------------------------------------------------------
// WorkSecret codec helpers
// ---------------------------------------------------------------------------

/** Encode a WorkSecret as a base64url string. */
export function encodeWorkSecret(secret: WorkSecret): string {
  const json = JSON.stringify(secret);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * Decode and validate a WorkSecret envelope.
 * Throws if the version is wrong, the secret is expired, or JSON is malformed.
 */
export function decodeWorkSecret(encoded: string): WorkSecret {
  let secret: WorkSecret;
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    secret = JSON.parse(json) as WorkSecret;
  } catch {
    throw new Error('WorkSecret: malformed base64url envelope');
  }

  if (secret.version !== WORK_SECRET_VERSION) {
    throw new Error(
      `WorkSecret: unsupported version ${String(secret.version)} (expected ${WORK_SECRET_VERSION})`,
    );
  }
  if (!secret.session_ingress_token) {
    throw new Error('WorkSecret: missing session_ingress_token');
  }
  if (secret.expires_at < Math.floor(Date.now() / 1000)) {
    throw new Error('WorkSecret: envelope expired');
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Bridge-ID validation
// ---------------------------------------------------------------------------

/**
 * Validate a bridge / environment / work ID.
 * Regex: `^[a-zA-Z0-9_-]+$`
 * Defends against path-traversal attempts (no slashes, dots, etc.).
 *
 * Citation: net-bridge-remote-server.md §2.1 `bridgeApi.ts:41,48-53`.
 */
const BRIDGE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function validateBridgeId(id: string): boolean {
  return BRIDGE_ID_RE.test(id);
}
