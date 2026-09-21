import {
  statableRetryAfterSeconds,
  statedWait,
  withoutExternalPurchaseSteering,
} from './failureCopy';

export type ApiPaywallRecoveryAction = 'upgrade' | 'subscribe' | 'manage_billing';

const PAYWALL_BODY_KIND = 'paywall';
const PAYWALL_DEFAULT_FEATURE = 'token_cap';
const PAYWALL_DEFAULT_TIER = 'basic';
const FREE_CAPACITY_UNAVAILABLE_CODE = 'free_capacity_unavailable';

function recoveryActionForPaywallCode(code: string | null): ApiPaywallRecoveryAction {
  if (code === 'subscription_required') return 'subscribe';
  if (code === 'subscription_inactive') return 'manage_billing';
  return 'upgrade';
}

export class ApiPaywallError extends Error {
  readonly feature: string;
  readonly requiredTier: string;
  readonly reason: string;
  readonly code: string | null;
  readonly recoveryAction: ApiPaywallRecoveryAction;

  constructor(feature: string, requiredTier: string, reason: string, code: string | null = null) {
    super(`Paywall: ${feature} requires ${requiredTier} tier. ${reason}`);
    this.name = 'ApiPaywallError';
    this.feature = feature;
    this.requiredTier = requiredTier;
    this.reason = withoutExternalPurchaseSteering(reason);
    this.code = code;
    this.recoveryAction = recoveryActionForPaywallCode(code);
  }
}

export class ApiFreeCapacityError extends Error {
  readonly code: string;
  readonly retryAtMs: number | null;

  constructor(retryAtMs: number | null) {
    super(
      retryAtMs === null
        ? 'Free capacity unavailable'
        : `Free capacity unavailable until ${new Date(retryAtMs).toISOString()}`,
    );
    this.name = 'ApiFreeCapacityError';
    this.code = FREE_CAPACITY_UNAVAILABLE_CODE;
    this.retryAtMs = retryAtMs;
  }
}

export interface ApiHttpErrorContext {
  retryAfterSeconds?: number;
  requestId?: string;
}

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterSeconds: number | undefined;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    context: ApiHttpErrorContext = {},
  ) {
    super(withoutExternalPurchaseSteering(message));
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = context.retryAfterSeconds;
    this.requestId = context.requestId;
  }
}

export const CLOUD_SIGN_IN_MESSAGE = 'Sign in to AGI Cloud to continue.';

const NO_MODEL_SWITCH_CODES = new Set([
  'auth_required',
  'request_cancelled',
  'max_output_tokens_exceeded',
  'tool_call_invalid',
  'client_update_required',
  FREE_CAPACITY_UNAVAILABLE_CODE,
  // The Free plan has one model, so another model is not a way out of its spent pool.
  'free_allowance_exhausted',
]);

export function offersModelSwitch(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.length > 0 && !NO_MODEL_SWITCH_CODES.has(code);
}

const CLIENT_UPDATE_REQUIRED_STATUS = 426;
export const CLIENT_UPDATE_REQUIRED_CODE = 'client_update_required';
// Retrying cannot help a build the service no longer answers, so the sentence says what can.
export const CLIENT_UPDATE_REQUIRED_MESSAGE =
  'This version of the app is too old for the service. Update AGI Workforce from your app store, then try again.';

export function httpErrorFrom(status: number, body: string): ApiHttpError {
  if (status === 401) return new ApiHttpError(CLOUD_SIGN_IN_MESSAGE, status, 'auth_required');
  const parsed = parseJsonBody(body);
  const candidate = parsed?.error ?? parsed?.message;
  let message: string | null = null;
  let code: string | null = null;
  let retryAfterSeconds: number | undefined;
  if (typeof candidate === 'string' && candidate.trim()) {
    message = candidate;
  } else if (candidate && typeof candidate === 'object') {
    const nested = candidate as {
      code?: unknown;
      message?: unknown;
      retry_after_seconds?: unknown;
    };
    if (typeof nested.code === 'string') code = nested.code;
    if (typeof nested.message === 'string' && nested.message.trim()) message = nested.message;
    retryAfterSeconds = statableRetryAfterSeconds(nested.retry_after_seconds);
  }
  const requestId = parsed?.['requestId'];
  if (status === CLIENT_UPDATE_REQUIRED_STATUS) code ??= CLIENT_UPDATE_REQUIRED_CODE;
  return new ApiHttpError(message ?? fallbackHttpMessage(status, retryAfterSeconds), status, code, {
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(typeof requestId === 'string' && requestId ? { requestId } : {}),
  });
}

function fallbackHttpMessage(status: number, retryAfterSeconds?: number): string {
  if (status === 429) {
    const wait = statedWait(retryAfterSeconds);
    return wait
      ? `Too many requests right now. Try again in ${wait}.`
      : 'Too many requests right now. Please wait a moment and try again.';
  }
  if (status === CLIENT_UPDATE_REQUIRED_STATUS) return CLIENT_UPDATE_REQUIRED_MESSAGE;
  if (status >= 500) return 'The server hit a problem handling this request. Please try again.';
  return `Request failed (HTTP ${status}). Please try again.`;
}

export function parseJsonBody(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function retryAtMsFrom(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const retryAtMs = Date.parse(value);
  return Number.isNaN(retryAtMs) ? null : retryAtMs;
}

export function rateLimitErrorFrom(
  body: Record<string, unknown> | null,
): ApiPaywallError | ApiFreeCapacityError | null {
  if (!body) return null;

  if (body.kind === PAYWALL_BODY_KIND) {
    return new ApiPaywallError(
      typeof body.feature === 'string' ? body.feature : PAYWALL_DEFAULT_FEATURE,
      typeof body.requiredTier === 'string' ? body.requiredTier : PAYWALL_DEFAULT_TIER,
      typeof body.reason === 'string' ? body.reason : '',
    );
  }

  const detail = body.error;
  if (detail === null || typeof detail !== 'object') return null;
  const { code, retry_at: retryAt } = detail as Record<string, unknown>;
  if (code !== FREE_CAPACITY_UNAVAILABLE_CODE) return null;

  return new ApiFreeCapacityError(retryAtMsFrom(retryAt));
}
