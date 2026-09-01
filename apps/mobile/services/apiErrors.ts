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
    this.reason = reason;
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

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
  }
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
