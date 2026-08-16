/**
 * Error taxonomy + classifier for the multi-provider runtime.
 *
 * Centralises the 30+ branch error matcher described in
 * `tasks/research/deep/m8-services-api.md` §3 (Anthropic's
 * `getAssistantMessageFromError` 30-branch matcher) and
 * §3.3 (`classifyAPIError`).
 *
 * The classifier returns a `ClassifiedError` with three orthogonal axes:
 *   - **category** — coarse Datadog tag (`rate_limit`, `auth`, …)
 *   - **retryable** — should the retry generator try this attempt again?
 *   - **fallbackable** — should the caller swap models?
 *
 * Each branch carries a human-readable `code` (e.g. `'rate_limit_429'`,
 * `'context_overflow'`) and an optional `retryAfterSeconds` so callers
 * can honour `Retry-After` headers without re-parsing.
 *
 * Two error classes are exported for the retry/fallback state machine:
 *   - `CannotRetryError` — retries exhausted; surface to user.
 *   - `FallbackTriggeredError` — switch model now; do not exhaust retries.
 *
 * NOTE: this module never logs. The retry generator decides whether to
 * pass the error to a user-facing renderer.
 */

import { parseRetryAfter } from './retry-after-internal';

export type ErrorCategory =
  | 'aborted'
  | 'api_timeout'
  | 'rate_limit'
  | 'server_overload'
  | 'capacity_off_switch'
  | 'context_overflow'
  | 'max_output'
  | 'tool_validation'
  | 'invalid_model'
  | 'invalid_input'
  | 'media_too_large'
  | 'auth'
  | 'safety' // refusal / content filter / Google safety reasons
  | 'connection'
  | 'pause_turn'
  | 'server_error'
  | 'client_error'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /**
   * Specific code — e.g. `'rate_limit_429'`, `'context_overflow'`,
   * `'safety_refusal'`. Stable strings, useful as map keys.
   */
  code: string;
  retryable: boolean;
  fallbackable: boolean;
  retryAfterSeconds?: number;
  status?: number;
  message: string;
  providerHint?: string;
}

export class CannotRetryError extends Error {
  readonly originalError: unknown;
  readonly classified: ClassifiedError;

  constructor(originalError: unknown, classified: ClassifiedError) {
    super(classified.message);
    this.name = 'CannotRetryError';
    this.originalError = originalError;
    this.classified = classified;
    if (originalError instanceof Error && typeof originalError.stack === 'string') {
      this.stack = originalError.stack;
    }
  }
}

export class FallbackTriggeredError extends Error {
  readonly originalModel: string;
  readonly fallbackModel: string;
  readonly classified: ClassifiedError;
  readonly originalError: unknown;

  constructor(
    originalModel: string,
    fallbackModel: string,
    classified: ClassifiedError,
    originalError: unknown,
  ) {
    super(`Fallback ${originalModel} → ${fallbackModel}: ${classified.message}`);
    this.name = 'FallbackTriggeredError';
    this.originalModel = originalModel;
    this.fallbackModel = fallbackModel;
    this.classified = classified;
    this.originalError = originalError;
  }
}

interface SDKErrorLike {
  status?: number;
  statusCode?: number;
  message?: string;
  name?: string;
  code?: string;
  type?: string;
  error?: { type?: string; message?: string; code?: string; status?: string };
  headers?: Headers | Record<string, string | string[] | undefined>;
  response?: {
    headers?: Headers | Record<string, string | string[] | undefined>;
    status?: number;
  };
  // Google API often nests an `error` object with `status` like 'RESOURCE_EXHAUSTED'.
  // Anthropic SDK v0.40 raises `APIError` with `status` numeric.
}

function asSDKError(err: unknown): SDKErrorLike {
  if (err && typeof err === 'object') return err as SDKErrorLike;
  if (typeof err === 'string') return { message: err };
  return { message: 'Unknown error' };
}

function extractStatus(e: SDKErrorLike): number | undefined {
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.response?.status === 'number') return e.response.status;
  return undefined;
}

function extractMessage(e: SDKErrorLike): string {
  if (typeof e.message === 'string') return e.message;
  if (typeof e.error?.message === 'string') return e.error.message;
  return 'Unknown error';
}

function extractRetryAfterSeconds(e: SDKErrorLike): number | undefined {
  return parseRetryAfter(e.headers ?? e.response?.headers ?? null);
}

function extractAnthropicOverageHint(e: SDKErrorLike): string | undefined {
  const h = e.headers ?? e.response?.headers;
  if (!h) return undefined;
  let raw: string | null | undefined;
  if (typeof (h as Headers).get === 'function') {
    raw = (h as Headers).get('anthropic-ratelimit-unified-overage-disabled-reason');
  } else {
    const rec = h as Record<string, string | string[] | undefined>;
    const v =
      rec['anthropic-ratelimit-unified-overage-disabled-reason'] ??
      rec['Anthropic-Ratelimit-Unified-Overage-Disabled-Reason'];
    raw = Array.isArray(v) ? v[0] : v;
  }
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

const CONTEXT_OVERFLOW_REGEX =
  /context (?:limit|window|length).{0,256}?(\d{1,64})[^\d]{1,64}(\d{1,64})[^\d]{1,64}(\d{1,64})/i;

function matchesContextOverflow(message: string): boolean {
  if (CONTEXT_OVERFLOW_REGEX.test(message)) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('context_length_exceeded') ||
    lower.includes('model_context_window_exceeded') ||
    lower.includes('prompt is too long') ||
    lower.includes('maximum context length')
  );
}

function matchesAuthError(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid api key') ||
    lower.includes('not logged in') ||
    lower.includes('oauth token') ||
    lower.includes('authentication')
  );
}

function matchesToolValidation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('tool_use ids were found without tool_result') ||
    lower.includes('unexpected tool_use_id') ||
    lower.includes('tool_use ids must be unique') ||
    (lower.includes('tool_calls') && lower.includes('mismatch'))
  );
}

function matchesMediaTooLarge(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('image exceeds') ||
    lower.includes('image dimensions exceed') ||
    lower.includes('many-image') ||
    lower.includes('maximum of') ||
    lower.includes('file size limit')
  );
}

function matchesSafetyReason(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('refusal') ||
    lower.includes('content_filter') ||
    lower.includes('content filter') ||
    lower.includes('safety') ||
    lower.includes('recitation') ||
    lower.includes('prohibited_content') ||
    lower.includes('blocklist')
  );
}

function matchesOverloaded(status: number | undefined, message: string): boolean {
  if (status === 529) return true;
  if (status === 503) return true;
  return /"type"\s*:\s*"overloaded_error"/i.test(message);
}

function matchesConnection(name: string | undefined, message: string): boolean {
  const lower = message.toLowerCase();
  return (
    name === 'APIConnectionError' ||
    name === 'APIConnectionTimeoutError' ||
    lower.includes('econnreset') ||
    lower.includes('epipe') ||
    lower.includes('socket hang up') ||
    lower.includes('network error') ||
    lower.includes('ssl') ||
    lower.includes('certificate')
  );
}

/**
 * Classify a thrown error from any provider into the canonical taxonomy.
 *
 * The branch order is significant — first match wins. Order is chosen so
 * the most specific signals are checked before the generic 4xx/5xx
 * fallbacks.
 *
 * @param err — the SDK or fetch error caught by the adapter.
 * @returns ClassifiedError with retry/fallback hints.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) {
    return {
      category: 'aborted',
      code: 'aborted',
      retryable: false,
      fallbackable: false,
      message: err.message,
    };
  }

  const e = asSDKError(err);
  const status = extractStatus(e);
  const message = extractMessage(e);
  const retryAfterSeconds = extractRetryAfterSeconds(e);
  const overageHint = extractAnthropicOverageHint(e);
  const lower = message.toLowerCase();

  if (matchesConnection(e.name, message) || lower.includes('timeout')) {
    return {
      category: lower.includes('timeout') ? 'api_timeout' : 'connection',
      code: lower.includes('timeout') ? 'api_timeout' : 'connection_error',
      retryable: true,
      fallbackable: false,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (matchesOverloaded(status, message)) {
    return {
      category: 'server_overload',
      code: status === 529 ? 'overloaded_529' : 'overloaded_503',
      retryable: true,
      fallbackable: true,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(typeof status === 'number' ? { status } : {}),
      message,
      ...(overageHint ? { providerHint: overageHint } : {}),
    };
  }

  if (status === 429) {
    return {
      category: 'rate_limit',
      code: 'rate_limit_429',
      retryable: true,
      fallbackable: true,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      status: 429,
      message,
      ...(overageHint ? { providerHint: overageHint } : {}),
    };
  }

  if (lower.includes('opus is experiencing high load')) {
    return {
      category: 'capacity_off_switch',
      code: 'capacity_off_switch',
      retryable: false,
      fallbackable: true,
      message,
    };
  }

  if (matchesContextOverflow(message)) {
    return {
      category: 'context_overflow',
      code: 'context_overflow',
      retryable: true, // retry generator resizes max_tokens
      fallbackable: true,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (matchesToolValidation(message)) {
    return {
      category: 'tool_validation',
      code: 'tool_validation',
      retryable: false,
      fallbackable: false,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (matchesMediaTooLarge(message)) {
    return {
      category: 'media_too_large',
      code: 'media_too_large',
      retryable: false,
      fallbackable: false,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (status === 413) {
    return {
      category: 'media_too_large',
      code: 'request_too_large_413',
      retryable: false,
      fallbackable: false,
      status: 413,
      message,
    };
  }

  if (lower.includes('model') && (lower.includes('not found') || lower.includes('invalid'))) {
    return {
      category: 'invalid_model',
      code: 'invalid_model',
      retryable: false,
      fallbackable: true, // try next in chain
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (lower.includes('credit balance is too low')) {
    return {
      category: 'auth',
      code: 'credit_balance_low',
      retryable: false,
      fallbackable: false,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (matchesAuthError(status, message)) {
    const lowerOAuth = lower.includes('oauth token has been revoked');
    const orgDisabled = lower.includes('organization has been disabled');
    return {
      category: 'auth',
      code: lowerOAuth
        ? 'oauth_revoked'
        : orgDisabled
          ? 'org_disabled'
          : status === 401
            ? 'auth_401'
            : 'auth_403',
      retryable: status === 401,
      fallbackable: false,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  // Branch 12 — safety / refusal.
  if (matchesSafetyReason(message)) {
    return {
      category: 'safety',
      code: 'safety_refusal',
      retryable: false,
      fallbackable: true, // try a different model
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (lower.includes('pause_turn') || e.error?.type === 'pause_turn') {
    return {
      category: 'pause_turn',
      code: 'pause_turn',
      retryable: false,
      fallbackable: false,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      category: 'server_error',
      code: `server_error_${status}`,
      retryable: true,
      fallbackable: status >= 502 && status <= 504,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      status,
      message,
    };
  }

  if (typeof status === 'number' && status >= 400) {
    return {
      category: 'client_error',
      code: `client_error_${status}`,
      retryable: false,
      fallbackable: false,
      status,
      message,
    };
  }

  return {
    category: 'unknown',
    code: 'unknown',
    retryable: false,
    fallbackable: false,
    message,
  };
}

export function parseContextOverflow(
  message: string,
): { inputTokens: number; requestedMaxTokens: number; contextLimit: number } | null {
  const m = CONTEXT_OVERFLOW_REGEX.exec(message);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const a = Number.parseInt(m[1], 10);
  const b = Number.parseInt(m[2], 10);
  const c = Number.parseInt(m[3], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  return { inputTokens: a, requestedMaxTokens: b, contextLimit: c };
}
