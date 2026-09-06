/**
 * Error taxonomy + classifier for the multi-provider runtime.
 *
 * Centralises the 30+ branch error matcher described in
 * `tasks/research/deep/m8-services-api.md` §3 (Anthropic's
 * `getAssistantMessageFromError` 30-branch matcher) and
 * §3.3 (`classifyAPIError`).
 *
 * The classifier returns a `ClassifiedError` with three orthogonal axes:
 *   - **category**, coarse Datadog tag (`rate_limit`, `auth`, …)
 *   - **retryable**, should the retry generator try this attempt again?
 *   - **fallbackable**, should the caller swap models?
 *
 * Each branch carries a human-readable `code` (e.g. `'rate_limit_429'`,
 * `'context_overflow'`) and an optional `retryAfterSeconds` so callers
 * can honour `Retry-After` headers without re-parsing.
 *
 * Two error classes are exported for the retry/fallback state machine:
 *   - `CannotRetryError`, retries exhausted; surface to user.
 *   - `FallbackTriggeredError`, switch model now; do not exhaust retries.
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
  /**
   * The upstream account has no spend headroom left: a hard 402, or a provider
   * message that plainly says the balance/credit is exhausted.
   *
   * Deliberately NOT `auth`. A credential that is merely unfunded is still a
   * VALID credential, and conflating the two makes an economic failure look like
   * a security failure, which then rotates the request onto a different PAID
   * provider instead of surfacing that we have run out of money.
   */
  | 'billing_exhausted'
  /**
   * A 429 whose provider-native signal says the quota WINDOW is spent (e.g.
   * OpenAI `insufficient_quota`), not that the caller is momentarily too fast.
   *
   * Distinct from `rate_limit` because the correct response differs: a short
   * rate limit is worth waiting out on the same route; an exhausted quota pool
   * must be taken out of service until it resets.
   */
  | 'quota_exhausted'
  | 'safety' // refusal / content filter / Google safety reasons
  /**
   * A step's stream completed with `status: ok` and a terminal signal that
   * is a content-policy stop (refusal / content_filter / a Google safety
   * finish reason), but produced no assistant text, tool call, or artifact.
   * Distinct from `safety`: `safety` is derived from a THROWN error's text;
   * this is derived from a clean, non-throwing stream termination that the
   * tool loop must classify itself. Never failover-eligible, for the same
   * reason `safety` is not, see `NEVER_ROTATE_CATEGORIES` in
   * managed-failover.ts.
   */
  | 'content_blocked'
  /**
   * A step's stream completed with `status: ok` and a non-blocked terminal
   * signal (a clean stop, or output-length exhaustion), but produced no
   * assistant text, tool call, or artifact, the provider claims success
   * and delivered nothing. Failover-eligible for Auto: a different route
   * may simply answer where this one did not.
   */
  | 'empty_response'
  | 'connection'
  | 'pause_turn'
  | 'server_error'
  | 'client_error'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /**
   * Specific code: e.g. `'rate_limit_429'`, `'context_overflow'`,
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

/**
 * Synthetic error a tool loop constructs to route a clean-but-empty provider
 * step through the same `classifyError` / failover pipeline a thrown error
 * uses, so `empty_response` gets the one rotation Auto is entitled to
 * without a second, parallel dispatch path.
 */
export class EmptyProviderResponseError extends Error {
  constructor(finishReason: string | null) {
    super(`Provider step finished with no content (finish_reason=${finishReason ?? 'none'})`);
    this.name = 'EmptyProviderResponseError';
  }
}

interface SDKErrorLike {
  status?: number;
  statusCode?: number;
  /**
   * A already-extracted Retry-After, in seconds.
   *
   * Set by layers that reconstruct an `Error` from a provider stream chunk
   * (the raw HTTP headers are long gone by then). Read in preference to nothing
   * at all, see `extractRetryAfterSeconds`.
   */
  retryAfterSeconds?: number;
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
  // Prefer real headers when we still have them.
  const fromHeaders = parseRetryAfter(e.headers ?? e.response?.headers ?? null);
  if (fromHeaders !== undefined) return fromHeaders;
  // Otherwise accept a value an upstream layer already extracted. Without this,
  // any error that crossed a stream-chunk boundary lost its Retry-After even
  // though the provider sent one, and every downstream backoff decision was made
  // blind.
  const direct = e.retryAfterSeconds;
  return typeof direct === 'number' && Number.isFinite(direct) && direct >= 0 ? direct : undefined;
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

const GOOGLE_TOKEN_OVERFLOW_PHRASE = 'exceeds the maximum number of tokens allowed';

function matchesContextOverflow(message: string): boolean {
  if (CONTEXT_OVERFLOW_REGEX.test(message)) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('context_length_exceeded') ||
    lower.includes('model_context_window_exceeded') ||
    lower.includes('prompt is too long') ||
    lower.includes('maximum context length') ||
    lower.includes(GOOGLE_TOKEN_OVERFLOW_PHRASE)
  );
}

/**
 * Provider-native codes that mean "this quota window is spent", as opposed to
 * "you are going too fast right now".
 *
 * The distinction is not cosmetic. A short 429 should be waited out on the same
 * route; an exhausted window must take the whole quota pool out of service until
 * it resets, or every subsequent request burns a round-trip rediscovering the
 * same wall. The signal is already present on the error object, OpenAI puts
 * `insufficient_quota` in `error.type`/`error.code`, Google reports
 * `RESOURCE_EXHAUSTED` in `error.status`, and was simply never read.
 */
const QUOTA_EXHAUSTED_CODES: ReadonlySet<string> = new Set([
  'insufficient_quota',
  'quota_exceeded',
  'resource_exhausted',
  'billing_hard_limit_reached',
]);

export const SPENDING_CAP_PROVIDER_HINT = 'spending_cap';

/**
 * Alibaba Model Studio answers an exhausted promotional allocation with
 * `AllocationQuota.FreeTierOnly` (HTTP 403 when "free quota only" is on) and an
 * exceeded paid allocation with `Throttling.AllocationQuota` (HTTP 429). Both
 * are quota facts about one model's pool, never credential facts: a 403 read as
 * `auth` would park every route on the provider over one spent allocation.
 */
const ALLOCATION_QUOTA_CODES: ReadonlySet<string> = new Set([
  'allocationquota.freetieronly',
  'throttling.allocationquota',
]);
export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';
export const FREE_TIER_ONLY_PROVIDER_HINT = 'free_tier_only';

/**
 * A discounted-capacity marketplace refuses a request whose required discount
 * has no qualifying supply (Cheaper Inference: HTTP 503 `min_discount_unavailable`)
 * rather than serving it at a higher price. The route has no capacity at the
 * price we accept; the provider is not down, and the request moves on.
 */
const MIN_DISCOUNT_UNAVAILABLE_CODES: ReadonlySet<string> = new Set(['min_discount_unavailable']);
export const MIN_DISCOUNT_UNAVAILABLE_CODE = 'min_discount_unavailable';

function errorCodeFields(e: SDKErrorLike): string[] {
  return [e.name, e.code, e.type, e.error?.type, e.error?.code, e.error?.status]
    .filter((raw): raw is string => typeof raw === 'string')
    .map((raw) => raw.trim().toLowerCase());
}

function matchesAllocationQuotaExhausted(e: SDKErrorLike, lowerMessage: string): boolean {
  if (errorCodeFields(e).some((code) => ALLOCATION_QUOTA_CODES.has(code))) return true;
  return [...ALLOCATION_QUOTA_CODES].some((code) => lowerMessage.includes(code));
}

function matchesMinimumDiscountUnavailable(e: SDKErrorLike, lowerMessage: string): boolean {
  if (errorCodeFields(e).some((code) => MIN_DISCOUNT_UNAVAILABLE_CODES.has(code))) return true;
  return [...MIN_DISCOUNT_UNAVAILABLE_CODES].some((code) => lowerMessage.includes(code));
}

function matchesSpendingCapExhausted(lowerMessage: string): boolean {
  return lowerMessage.includes('spending cap');
}

/**
 * A spending cap is a quota-window-exhausted signal in its own right, not
 * merely decoration on one of the other markers below. Gating it behind an
 * already-true `matchesQuotaExhausted` result meant a 429 that said ONLY
 * "spending cap" (no `insufficient_quota`, no matching code) fell through to
 * plain `rate_limit`, which is worth waiting out on the same route. A spent
 * spending cap is not: it needs the same pool-taken-out-of-service handling
 * as every other quota-exhausted signal, see `SPENDING_CAP_PROVIDER_HINT`.
 */
function matchesQuotaExhausted(e: SDKErrorLike, lowerMessage: string): boolean {
  const codes = [e.code, e.type, e.error?.type, e.error?.code, e.error?.status];
  for (const raw of codes) {
    if (typeof raw === 'string' && QUOTA_EXHAUSTED_CODES.has(raw.trim().toLowerCase())) {
      return true;
    }
  }
  return (
    lowerMessage.includes('insufficient_quota') ||
    lowerMessage.includes('exceeded your current quota') ||
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('resource_exhausted') ||
    matchesSpendingCapExhausted(lowerMessage)
  );
}

/**
 * The credential is valid and funded, but the account's plan or tier is not
 * entitled to the model that was asked for. Vercel AI Gateway returns a 403
 * carrying `no_providers_available` / `RestrictedModelsError` when a free-tier
 * key requests a premium model.
 *
 * Deliberately NOT `auth`, for the same reason `billing_exhausted` is not: the
 * key works. Classifying an entitlement refusal as a credential failure would
 * take the whole provider out of service over one model the tier cannot reach,
 * when the correct response is to route around that model and keep the route.
 */
const TIER_RESTRICTED_CODES: ReadonlySet<string> = new Set([
  'no_providers_available',
  'restrictedmodelserror',
]);

function matchesTierRestricted(e: SDKErrorLike, status: number | undefined): boolean {
  if (status !== 403) return false;
  const codes = [e.name, e.code, e.type, e.error?.type, e.error?.code, e.error?.status];
  return codes.some(
    (raw) => typeof raw === 'string' && TIER_RESTRICTED_CODES.has(raw.trim().toLowerCase()),
  );
}

/**
 * The upstream account is out of money.
 *
 * A 402 is unambiguous. The wording checks cover providers that return a 400/429
 * with a balance message instead. This must never be classified `auth`: an
 * unfunded key is still a valid key, and treating it as a credential failure is
 * what previously caused an exhausted paid account to rotate the request onto a
 * DIFFERENT paid provider rather than surfacing the billing problem.
 */
function matchesBillingExhausted(status: number | undefined, lowerMessage: string): boolean {
  if (status === 402) return true;
  return (
    lowerMessage.includes('credit balance is too low') ||
    lowerMessage.includes('insufficient credit') ||
    lowerMessage.includes('insufficient funds') ||
    lowerMessage.includes('payment required') ||
    lowerMessage.includes('billing hard limit')
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
    name === 'EmptyStreamError' ||
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
 * The branch order is significant, first match wins. Order is chosen so
 * the most specific signals are checked before the generic 4xx/5xx
 * fallbacks.
 *
 * @param err, the SDK or fetch error caught by the adapter.
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

  if (err instanceof Error && err.name === 'EmptyProviderResponseError') {
    return {
      category: 'empty_response',
      code: 'empty_response',
      retryable: false,
      fallbackable: true,
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

  if (matchesAllocationQuotaExhausted(e, lower)) {
    return {
      category: 'quota_exhausted',
      code: FREE_QUOTA_EXHAUSTED_CODE,
      retryable: false,
      fallbackable: true,
      ...(typeof status === 'number' ? { status } : {}),
      message,
      providerHint: FREE_TIER_ONLY_PROVIDER_HINT,
    };
  }

  if (matchesMinimumDiscountUnavailable(e, lower)) {
    return {
      category: 'capacity_off_switch',
      code: MIN_DISCOUNT_UNAVAILABLE_CODE,
      retryable: false,
      fallbackable: true,
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
    // A 429 means two very different things depending on the provider-native
    // code riding alongside it. OpenAI's `insufficient_quota` (and the
    // equivalent wording other vendors use) says the billing/quota WINDOW is
    // spent, retrying in a second cannot help, and the pool should be taken out
    // of service until it resets. A plain 429 is back-pressure and IS worth
    // waiting out. Both were previously collapsed into `rate_limit`.
    if (matchesQuotaExhausted(e, lower)) {
      return {
        category: 'quota_exhausted',
        code: 'insufficient_quota_429',
        // Retrying the SAME route is pointless until the window resets; a
        // different route with its own quota is fine, which is why this stays
        // fallbackable while `retryable` is false.
        retryable: false,
        fallbackable: true,
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        status: 429,
        message,
        ...(overageHint
          ? { providerHint: overageHint }
          : matchesSpendingCapExhausted(lower)
            ? { providerHint: SPENDING_CAP_PROVIDER_HINT }
            : {}),
      };
    }
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

  if (matchesTierRestricted(e, status)) {
    return {
      category: 'invalid_model',
      code: 'model_tier_restricted',
      retryable: false,
      fallbackable: true,
      ...(typeof status === 'number' ? { status } : {}),
      message,
    };
  }

  if (matchesBillingExhausted(status, lower)) {
    return {
      category: 'billing_exhausted',
      code: status === 402 ? 'payment_required_402' : 'credit_balance_low',
      // Waiting does not add funds, and neither does another provider: this is
      // an operator problem, not a routing problem.
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

  // Branch 12, safety / refusal.
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
