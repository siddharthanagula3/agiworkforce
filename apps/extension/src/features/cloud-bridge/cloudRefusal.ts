import { DenialErrorCode, ErrorCode } from '@agiworkforce/types';

export type CloudRefusalKind =
  | 'auth'
  | 'unavailable'
  | 'plan'
  | 'policy'
  | 'account'
  | 'rate_limited'
  | 'conflict'
  | 'invalid'
  | 'refused'
  | 'failed';

export interface CloudRefusal {
  kind: CloudRefusalKind;
  status: number;
  code?: string;
  reason?: string;
  message?: string;
  retryAfterSeconds?: number;
  limit?: number;
  resetAt?: string;
  upgradePath?: string;
}

const MAX_REFUSAL_BODY_CHARS = 16_384;
const MAX_MESSAGE_CHARS = 500;
const MAX_RETRY_AFTER_SECONDS = 86_400;

const ORGANIZATION_POLICY_TYPE = 'organization_policy';
const LOCKDOWN_CODE = ErrorCode.FORBIDDEN;

const POLICY_CODES: ReadonlySet<string> = new Set([
  'surface_not_allowed',
  'region_not_allowed',
  'feature_disabled',
  'surface_sync_disabled',
  'workspace_not_accessible',
  'workspace_policy_unavailable',
  'managed_compute_disabled',
  'privacy_mode_not_allowed',
  'audit_export_disabled',
  'external_sharing_disabled',
  'mfa_required',
  'spend_cap_exceeded',
  'billing_read_only',
  'billing_past_due',
  'code_control_disabled',
  'code_host_not_allowed',
  'code_mcp_server_not_allowed',
  DenialErrorCode.DISABLED_BY_ORGANIZATION,
  DenialErrorCode.DISABLED_BY_WORKSPACE,
]);

const PLAN_CODES: ReadonlySet<string> = new Set([
  ErrorCode.SUBSCRIPTION_REQUIRED,
  'plan_upgrade_required',
  'developer_surface_plan_required',
  'schedules_not_in_plan',
  'schedule_limit_reached',
]);

const ACCOUNT_GATE_CODES: ReadonlySet<string> = new Set([
  ErrorCode.MFA_REQUIRED,
  ErrorCode.IP_NOT_ALLOWED,
  ErrorCode.PASSKEY_REQUIRED,
  ErrorCode.ACCOUNT_UNAVAILABLE,
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, max = MAX_MESSAGE_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function seconds(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.ceil(value);
  return rounded >= 0 && rounded <= MAX_RETRY_AFTER_SECONDS ? rounded : undefined;
}

function retryAfterHeader(headers: Headers | null | undefined): number | undefined {
  const raw = headers?.get('retry-after')?.trim();
  if (!raw) return undefined;
  if (/^\d+$/u.test(raw)) return seconds(Number(raw));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : seconds(Math.max(0, (at - Date.now()) / 1000));
}

function relativePath(value: unknown): string | undefined {
  const path = text(value, 200);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : undefined;
}

export function classifyCloudRefusal(
  status: number,
  body: unknown,
  headers?: Headers | null,
): CloudRefusal {
  const root = record(body);
  const rawError = root?.['error'];
  const error = record(rawError);
  const details = record(error?.['details']);
  const rateLimit = record(root?.['rateLimit']);
  const code = text(error?.['code'], 100) ?? text(rawError, 100);
  const detailCode = text(details?.['code'], 100);
  const reason = text(error?.['reason'], 200) ?? detailCode;
  const serverMessage = text(error?.['message']) ?? (error ? undefined : text(rawError));
  const retryAfterSeconds =
    retryAfterHeader(headers) ??
    seconds(error?.['retry_after_seconds']) ??
    seconds(rateLimit?.['retry_after_seconds']);
  const isPolicy =
    error?.['type'] === ORGANIZATION_POLICY_TYPE || (code !== undefined && POLICY_CODES.has(code));
  const base: CloudRefusal = {
    kind: 'failed',
    status,
    ...(code ? { code } : {}),
    ...(reason ? { reason } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };

  if (status === 401) return { ...base, kind: 'auth' };
  if (status === 503) {
    return {
      ...base,
      kind: 'unavailable',
      ...(isPolicy && serverMessage ? { message: serverMessage } : {}),
    };
  }
  if (status === 429) {
    const limit = rateLimit?.['limit'];
    const resetAt = text(error?.['reset_at'], 64) ?? text(rateLimit?.['reset_at'], 64);
    return {
      ...base,
      kind: 'rate_limited',
      ...(serverMessage ? { message: serverMessage } : {}),
      ...(typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? { limit } : {}),
      ...(resetAt && !Number.isNaN(Date.parse(resetAt)) ? { resetAt } : {}),
    };
  }
  if (status === 403) {
    if (isPolicy || code === LOCKDOWN_CODE) {
      return { ...base, kind: 'policy', ...(serverMessage ? { message: serverMessage } : {}) };
    }
    if ((code && PLAN_CODES.has(code)) || (detailCode && PLAN_CODES.has(detailCode))) {
      const upgradePath = relativePath(record(details?.['recovery'])?.['href']);
      return {
        ...base,
        kind: 'plan',
        ...(serverMessage ? { message: serverMessage } : {}),
        ...(typeof details?.['limit'] === 'number' ? { limit: details['limit'] } : {}),
        ...(upgradePath ? { upgradePath } : {}),
      };
    }
    if (code && ACCOUNT_GATE_CODES.has(code)) {
      return { ...base, kind: 'account', ...(serverMessage ? { message: serverMessage } : {}) };
    }
    return { ...base, kind: 'refused' };
  }
  if (status === 409) {
    return { ...base, kind: 'conflict', ...(serverMessage ? { message: serverMessage } : {}) };
  }
  if (status === 400 || status === 422) {
    return { ...base, kind: 'invalid', ...(serverMessage ? { message: serverMessage } : {}) };
  }
  return base;
}

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text().catch(() => '')).slice(0, MAX_REFUSAL_BODY_CHARS);
  const decoder = new TextDecoder();
  let collected = '';
  try {
    while (collected.length < MAX_REFUSAL_BODY_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      collected += decoder.decode(value, { stream: true });
    }
  } catch {
    return collected.slice(0, MAX_REFUSAL_BODY_CHARS);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return collected.slice(0, MAX_REFUSAL_BODY_CHARS);
}

export async function readCloudRefusal(response: Response): Promise<CloudRefusal> {
  let body: unknown = null;
  try {
    const raw = await readBoundedText(response);
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return classifyCloudRefusal(response.status, body, response.headers);
}

export interface CloudRefusalCapture {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly last: CloudRefusal | null;
}

export function captureCloudRefusals(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (input, init) =>
    fetch(input, init),
): CloudRefusalCapture {
  let last: CloudRefusal | null = null;
  return {
    async fetch(input, init) {
      const response = await fetchImpl(input, init);
      if (!response.ok) last = await readCloudRefusal(response.clone());
      return response;
    },
    get last() {
      return last;
    },
  };
}

export function retryAfterSentence(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined || retryAfterSeconds <= 1) return 'Try again in a moment.';
  if (retryAfterSeconds < 120) return `Try again in ${retryAfterSeconds} seconds.`;
  return `Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`;
}

export function rateLimitSentence(refusal: CloudRefusal, unit: string): string {
  const lead = refusal.message ?? 'Too many requests.';
  const limit = refusal.limit !== undefined ? ` The limit is ${refusal.limit} ${unit}.` : '';
  const reset = refusal.resetAt ? new Date(refusal.resetAt) : null;
  const resets =
    reset && !Number.isNaN(reset.getTime())
      ? ` It resets ${reset.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
      : ` ${retryAfterSentence(refusal.retryAfterSeconds)}`;
  return `${lead}${limit}${resets}`;
}

export interface CloudRefusalCopy {
  refused: string;
  unavailable: string;
  limitUnit: string;
}

export function describeCloudRefusal(refusal: CloudRefusal, copy: CloudRefusalCopy): string {
  switch (refusal.kind) {
    case 'auth':
      return 'Sign in to your AGI account to continue.';
    case 'plan':
    case 'policy':
    case 'account':
    case 'conflict':
    case 'invalid':
      return refusal.message ?? copy.refused;
    case 'unavailable':
      return (
        refusal.message ?? `${copy.unavailable} ${retryAfterSentence(refusal.retryAfterSeconds)}`
      );
    case 'rate_limited':
      return rateLimitSentence(refusal, copy.limitUnit);
    case 'refused':
      return copy.refused;
    default:
      return copy.unavailable;
  }
}
