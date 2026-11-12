import { ErrorCode } from '@agiworkforce/types';

export type AccountRefusalKind = 'account' | 'policy' | 'plan' | 'unavailable';

const ACCOUNT_REFUSAL_KINDS: ReadonlyMap<string, AccountRefusalKind> = new Map([
  [ErrorCode.ACCOUNT_UNAVAILABLE, 'account'],
  [ErrorCode.PASSKEY_REQUIRED, 'account'],
  [ErrorCode.MFA_REQUIRED, 'account'],
  [ErrorCode.IP_NOT_ALLOWED, 'account'],
  [ErrorCode.FORBIDDEN, 'policy'],
  ['SURFACE_NOT_ALLOWED', 'policy'],
  ['REGION_NOT_ALLOWED', 'policy'],
  ['FEATURE_DISABLED', 'policy'],
  ['SURFACE_SYNC_DISABLED', 'policy'],
  ['WORKSPACE_NOT_ACCESSIBLE', 'policy'],
  [ErrorCode.SUBSCRIPTION_REQUIRED, 'plan'],
  ['SUBSCRIPTION_INACTIVE', 'plan'],
  ['DEVELOPER_SURFACE_PLAN_REQUIRED', 'plan'],
  ['MANAGED_API_PLAN_REQUIRED', 'plan'],
  ['MANAGED_CHAT_PLAN_REQUIRED', 'plan'],
  ['PLAN_UPGRADE_REQUIRED', 'plan'],
  ['MODEL_NOT_AVAILABLE', 'plan'],
  [ErrorCode.SERVICE_UNAVAILABLE, 'unavailable'],
  ['WORKSPACE_POLICY_UNAVAILABLE', 'unavailable'],
]);

const REFUSAL_STATUS_BY_KIND: Readonly<Record<AccountRefusalKind, number>> = {
  account: 403,
  policy: 403,
  plan: 403,
  unavailable: 503,
};

const SERVER_TEXT_STATUSES: ReadonlySet<number> = new Set([403, 503]);
const STATUS_PREFIX = /^HTTP (\d{3}):\s*/u;
const BARE_STATUS = /^HTTP \d{3}$/u;
export const ACCOUNT_REFUSAL_TEXT_MAX_LENGTH = 240;

function boundedRefusalText(text: string): string | undefined {
  const line = text.replace(/\s+/gu, ' ').trim();
  if (line === '') return undefined;
  const characters = Array.from(line);
  if (characters.length <= ACCOUNT_REFUSAL_TEXT_MAX_LENGTH) return line;
  return `${characters
    .slice(0, ACCOUNT_REFUSAL_TEXT_MAX_LENGTH - 1)
    .join('')
    .trimEnd()}\u2026`;
}

export interface AccountRefusal {
  code: string;
  message: string;
  kind: AccountRefusalKind;
  retryAfterMs?: number;
}

export function accountRefusalKind(code: string | undefined): AccountRefusalKind | undefined {
  return code === undefined ? undefined : ACCOUNT_REFUSAL_KINDS.get(code.toUpperCase());
}

export function parseRetryAfterMs(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  if (/^\d+$/u.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

export async function readAccountRefusal(response: Response): Promise<AccountRefusal | undefined> {
  if (!SERVER_TEXT_STATUSES.has(response.status)) return undefined;
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const error = body?.error as { code?: unknown; message?: unknown } | undefined;
  if (typeof error?.code !== 'string' || typeof error.message !== 'string') return undefined;
  const code = error.code.toUpperCase();
  const message = boundedRefusalText(error.message);
  const kind = accountRefusalKind(code);
  if (
    kind === undefined ||
    message === undefined ||
    REFUSAL_STATUS_BY_KIND[kind] !== response.status
  ) {
    return undefined;
  }
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
  return { code, message, kind, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
}

function serverTextOf(error: { status?: unknown; message?: unknown }): string | undefined {
  if (typeof error.status !== 'number' || !SERVER_TEXT_STATUSES.has(error.status)) return undefined;
  if (typeof error.message !== 'string') return undefined;
  const text = error.message.trim().replace(STATUS_PREFIX, '').trim();
  return BARE_STATUS.test(text) ? undefined : boundedRefusalText(text);
}

export function accountRefusalMessage(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  if (candidate === null || typeof candidate !== 'object') return undefined;
  if (typeof candidate.message !== 'string') return undefined;
  if (typeof candidate.code === 'string') {
    return accountRefusalKind(candidate.code) !== undefined
      ? boundedRefusalText(candidate.message)
      : undefined;
  }
  return serverTextOf(candidate);
}
