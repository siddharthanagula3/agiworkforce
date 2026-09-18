export const AUTH_ERROR_KINDS = [
  'rate_limited',
  'code_expired',
  'code_incorrect',
  'link_expired',
  'link_already_used',
  'account_suspended',
  'account_locked',
  'credentials_invalid',
  'identifier_not_found',
  'identifier_exists',
  'provider_cancelled',
  'provider_outage',
  'passkey_dismissed',
  'passkey_unrecognized',
  'network_unreachable',
  'unexpected',
] as const;

export type AuthErrorKind = (typeof AUTH_ERROR_KINDS)[number];

export const AUTH_NOTICE_KINDS = [
  'rate_limited',
  'provider_cancelled',
  'link_expired',
  'link_already_used',
  'account_suspended',
  'account_locked',
  'provider_outage',
] as const;

export type AuthNoticeKind = (typeof AUTH_NOTICE_KINDS)[number];

export type AuthErrorField = 'email' | 'password' | 'code';

export interface AuthErrorDescriptor {
  kind: AuthErrorKind;
  field?: AuthErrorField;
  retryAfterSeconds?: number;
  vendorMessage?: string;
}

export interface VendorAuthError {
  code?: string;
  message?: string;
  longMessage?: string;
  status?: number;
  retryAfter?: number;
  meta?: { paramName?: string; retryAfter?: number };
  errors?: VendorAuthError[];
}

const CODE_KINDS: Readonly<Record<string, AuthErrorKind>> = {
  form_identifier_not_found: 'identifier_not_found',
  form_param_nil: 'identifier_not_found',
  form_identifier_exists: 'identifier_exists',
  form_password_incorrect: 'credentials_invalid',
  form_code_incorrect: 'code_incorrect',
  verification_failed: 'code_incorrect',
  verification_expired: 'code_expired',
  verification_already_verified: 'link_already_used',
  client_state_invalid: 'link_expired',
  too_many_requests: 'rate_limited',
  rate_limit_exceeded: 'rate_limited',
  user_locked: 'account_locked',
  user_banned: 'account_suspended',
  account_suspended: 'account_suspended',
  oauth_access_denied: 'provider_cancelled',
  oauth_email_domain_reserved: 'provider_outage',
  oauth_fetch_user_error: 'provider_outage',
  oauth_token_exchange_error: 'provider_outage',
  external_account_exists: 'identifier_exists',
  passkey_retrieval_cancelled: 'passkey_dismissed',
  passkey_operation_aborted: 'passkey_dismissed',
  passkey_registration_cancelled: 'passkey_dismissed',
  passkey_not_registered: 'passkey_unrecognized',
  passkey_identifier_mismatch: 'passkey_unrecognized',
  passkey_authentication_failure: 'passkey_unrecognized',
};

const FIELD_BY_PARAM: Readonly<Record<string, AuthErrorField>> = {
  identifier: 'email',
  email_address: 'email',
  emailAddress: 'email',
  password: 'password',
  code: 'code',
};

const RATE_LIMIT_STATUS = 429;
const SERVER_FAULT_STATUS = 500;

export function readVendorAuthError(error: unknown): VendorAuthError | null {
  if (!error || typeof error !== 'object') return null;
  const envelope = error as VendorAuthError;
  const first = envelope.errors?.[0];
  if (!first) return envelope;
  return {
    ...first,
    status: first.status ?? envelope.status,
    retryAfter: first.retryAfter ?? envelope.retryAfter,
  };
}

function kindFromCode(code: string): AuthErrorKind | null {
  const mapped = CODE_KINDS[code];
  if (mapped) return mapped;
  if (code.includes('already_verified') || code.includes('already_used'))
    return 'link_already_used';
  if (code.includes('expired')) return 'code_expired';
  if (code.startsWith('oauth_') || code.startsWith('external_account_')) return 'provider_outage';
  if (code.startsWith('passkey_')) return 'passkey_unrecognized';
  return null;
}

function retryAfterOf(vendor: VendorAuthError): number | undefined {
  const seconds = vendor.retryAfter ?? vendor.meta?.retryAfter;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : undefined;
}

export function classifyAuthError(error: unknown): AuthErrorDescriptor {
  if (error instanceof TypeError) return { kind: 'network_unreachable' };

  const vendor = readVendorAuthError(error);
  if (!vendor) return { kind: 'unexpected' };

  const status = vendor.status;
  const code = vendor.code ?? '';
  const kind =
    (status === RATE_LIMIT_STATUS ? 'rate_limited' : null) ??
    kindFromCode(code) ??
    (typeof status === 'number' && status >= SERVER_FAULT_STATUS ? 'provider_outage' : null) ??
    'unexpected';

  const param = vendor.meta?.paramName;
  const field = param ? FIELD_BY_PARAM[param] : undefined;
  const retryAfterSeconds = retryAfterOf(vendor);
  const message = (vendor.longMessage ?? vendor.message ?? '').trim();

  return {
    kind,
    ...(field ? { field } : {}),
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(kind === 'unexpected' && code.startsWith('form_') && message
      ? { vendorMessage: message }
      : {}),
  };
}

export function isAuthNoticeKind(kind: AuthErrorKind): kind is AuthNoticeKind {
  return (AUTH_NOTICE_KINDS as readonly AuthErrorKind[]).includes(kind);
}

const RETRYABLE_KINDS: readonly AuthErrorKind[] = [
  'passkey_dismissed',
  'passkey_unrecognized',
  'provider_cancelled',
  'provider_outage',
  'network_unreachable',
];

export function isRetryableAuthError(kind: AuthErrorKind): boolean {
  return RETRYABLE_KINDS.includes(kind);
}

// The provider redirects back with an OAuth2 error parameter, never with the
// vendor envelope the in-app calls return.
const CALLBACK_ERROR_KINDS: Readonly<Record<string, AuthNoticeKind>> = {
  access_denied: 'provider_cancelled',
  consent_required: 'provider_cancelled',
  login_required: 'provider_cancelled',
  interaction_required: 'provider_cancelled',
  temporarily_unavailable: 'provider_outage',
  server_error: 'provider_outage',
};

export function classifyProviderCallbackError(code: string | undefined): AuthNoticeKind | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  return CALLBACK_ERROR_KINDS[trimmed] ?? 'provider_outage';
}
