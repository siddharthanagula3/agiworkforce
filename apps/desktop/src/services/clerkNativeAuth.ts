
export type ClerkSignInStatus =
  | 'needs_identifier'
  | 'needs_first_factor'
  | 'needs_second_factor'
  | 'needs_new_password'
  | 'complete';

export interface ClerkFirstFactor {
  strategy: string;
  emailAddressId?: string;
  safeIdentifier?: string;
  phoneNumberId?: string;
}

export interface ClerkSecondFactor {
  strategy: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
}

export interface ClerkSignIn {
  id: string;
  status: ClerkSignInStatus;
  identifier: string | null;
  createdSessionId: string | null;
  supportedFirstFactors: ClerkFirstFactor[];
  supportedSecondFactors: ClerkSecondFactor[];
  externalVerificationRedirectUrl: string | null;
  firstFactorVerificationStatus: string | null;
}

export type ClerkAuthFailureKind =
  | 'invalid_credentials'
  | 'identifier_not_found'
  | 'invalid_code'
  | 'code_expired'
  | 'account_locked'
  | 'email_unverified'
  | 'password_reset_required'
  | 'mfa_required'
  | 'rate_limited'
  | 'not_configured'
  | 'network'
  | 'server_error'
  | 'unexpected';

export class ClerkAuthError extends Error {
  readonly kind: ClerkAuthFailureKind;
  readonly status: number | undefined;
  readonly clerkCode: string | undefined;

  constructor(
    kind: ClerkAuthFailureKind,
    message: string,
    options?: { status?: number; clerkCode?: string; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ClerkAuthError';
    this.kind = kind;
    this.status = options?.status;
    this.clerkCode = options?.clerkCode;
  }
}

export interface ClerkNativeTransportResponse {
  status: number;
  body: string;
  clientToken?: string | null;
}

export interface ClerkNativeTransportRequest {
  publishableKey: string;
  method: 'GET' | 'POST';
  path: string;
  body?: string;
  clientToken?: string | null;
  search?: string;
}

export type ClerkNativeTransport = (
  request: ClerkNativeTransportRequest,
) => Promise<ClerkNativeTransportResponse>;

interface ClerkApiErrorShape {
  code?: unknown;
  message?: unknown;
  long_message?: unknown;
  meta?: { param_name?: unknown } | null;
}

export function getClerkPublishableKey(): string | null {
  const raw = (import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] as string | undefined)?.trim();
  if (!raw) return null;
  if (!raw.startsWith('pk_live_') && !raw.startsWith('pk_test_')) return null;
  return raw;
}

export function isNativeClerkSignInConfigured(): boolean {
  return getClerkPublishableKey() !== null;
}

async function invokeNativeTransport(
  request: ClerkNativeTransportRequest,
): Promise<ClerkNativeTransportResponse> {
  const { invoke } = await import('../lib/tauri-mock');
  return invoke<ClerkNativeTransportResponse>('account_clerk_native_request', {
    publishableKey: request.publishableKey,
    method: request.method,
    path: request.path,
    body: request.body ?? null,
    clientToken: request.clientToken ?? null,
    search: request.search ?? null,
  });
}

let transportOverride: ClerkNativeTransport | null = null;

export function __setClerkNativeTransportForTests(transport: ClerkNativeTransport | null): void {
  transportOverride = transport;
}

let clientToken: string | null = null;

export function resetClerkClient(): void {
  clientToken = null;
}

function encodeForm(fields: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    params.append(key, value);
  }
  return params.toString();
}

function readClerkErrors(body: string): ClerkApiErrorShape[] {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const errors = (parsed as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) return [];
    return errors.filter(
      (entry): entry is ClerkApiErrorShape =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry),
    );
  } catch {
    return [];
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function mapClerkFailure(
  status: number,
  body: string,
  context: 'create' | 'first_factor' | 'second_factor' | 'prepare' | 'session_token' | 'reload',
): ClerkAuthError {
  if (status >= 500) {
    return new ClerkAuthError(
      'server_error',
      `The AGI account service failed while signing you in (HTTP ${status}). ` +
        'This is a fault on the service, not a problem with your account or password. ' +
        'Please try again in a moment.',
      { status },
    );
  }

  const errors = readClerkErrors(body);
  const primary = errors[0];
  const code = typeof primary?.code === 'string' ? primary.code : undefined;
  const clerkMessage = firstString(primary?.long_message, primary?.message);

  if (status === 429) {
    return new ClerkAuthError(
      'rate_limited',
      clerkMessage ?? 'Too many sign-in attempts. Wait a minute before trying again.',
      { status, ...(code ? { clerkCode: code } : {}) },
    );
  }

  switch (code) {
    case 'form_password_incorrect':
    case 'form_password_pwned':
      return new ClerkAuthError(
        'invalid_credentials',
        'That password is not correct for this email address.',
        { status, clerkCode: code },
      );
    case 'form_identifier_not_found':
      return new ClerkAuthError(
        'identifier_not_found',
        'No AGI account exists for that email address.',
        { status, clerkCode: code },
      );
    case 'form_param_format_invalid':
    case 'form_param_nil':
      return new ClerkAuthError(
        'invalid_credentials',
        clerkMessage ?? 'Check the email address you entered.',
        { status, clerkCode: code },
      );
    case 'form_code_incorrect':
    case 'verification_failed':
      return new ClerkAuthError('invalid_code', 'That sign-in code is not correct.', {
        status,
        clerkCode: code,
      });
    case 'verification_expired':
      return new ClerkAuthError('code_expired', 'That sign-in code has expired. Send a new one.', {
        status,
        clerkCode: code,
      });
    case 'user_locked':
      return new ClerkAuthError(
        'account_locked',
        clerkMessage ?? 'This account is temporarily locked after too many failed attempts.',
        { status, clerkCode: code },
      );
    case 'identifier_not_verified':
    case 'form_identifier_not_verified':
      return new ClerkAuthError(
        'email_unverified',
        'This email address has not been verified yet. Use "Email me a sign-in code" to verify it and sign in.',
        { status, clerkCode: code },
      );
    case 'session_exists':
      return new ClerkAuthError(
        'unexpected',
        'A sign-in is already in progress on this device. Start again.',
        { status, clerkCode: code },
      );
    case 'strategy_for_user_invalid':
      return new ClerkAuthError(
        'invalid_credentials',
        clerkMessage ?? 'That sign-in method is not enabled for this account. Try a different one.',
        { status, clerkCode: code },
      );
    default:
      break;
  }

  const contextLabel =
    context === 'session_token'
      ? 'while finishing sign-in'
      : context === 'prepare'
        ? 'while sending your sign-in code'
        : 'while signing you in';

  return new ClerkAuthError(
    'unexpected',
    clerkMessage ?? `The AGI account service refused the request ${contextLabel} (HTTP ${status}).`,
    { status, ...(code ? { clerkCode: code } : {}) },
  );
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  options: {
    form?: Record<string, string | undefined>;
    search?: string;
    context: 'create' | 'first_factor' | 'second_factor' | 'prepare' | 'session_token' | 'reload';
  },
): Promise<unknown> {
  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) {
    throw new ClerkAuthError(
      'not_configured',
      'In-app sign-in is not configured in this build (VITE_CLERK_PUBLISHABLE_KEY is unset).',
    );
  }

  const transport = transportOverride ?? invokeNativeTransport;

  const { isPrivateTrustBoundary } = await import('../stores/privacyBoundary');
  if (isPrivateTrustBoundary()) {
    throw new ClerkAuthError(
      'unexpected',
      'AGI Cloud sign-in is unavailable in Local Mode. Local Mode needs no account.',
    );
  }

  let response: ClerkNativeTransportResponse;
  try {
    response = await transport({
      publishableKey,
      method,
      path,
      ...(options.form ? { body: encodeForm(options.form) } : {}),
      clientToken,
      ...(options.search ? { search: options.search } : {}),
    });
  } catch (error) {
    throw new ClerkAuthError(
      'network',
      `Could not reach the AGI account service: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (typeof response?.status !== 'number' || typeof response?.body !== 'string') {
    throw new ClerkAuthError(
      'unexpected',
      'AGI Desktop received an unreadable response from the account service.',
    );
  }

  if (typeof response.clientToken === 'string' && response.clientToken.length > 0) {
    clientToken = response.clientToken;
  }

  if (response.status < 200 || response.status > 299) {
    throw mapClerkFailure(response.status, response.body, options.context);
  }

  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new ClerkAuthError(
      'unexpected',
      'The AGI account service returned a response AGI Desktop could not read.',
      { status: response.status },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseFactors(value: unknown): ClerkFirstFactor[] {
  if (!Array.isArray(value)) return [];
  const factors: ClerkFirstFactor[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const strategy = optionalString(record?.['strategy']);
    if (!strategy) continue;
    const emailAddressId = optionalString(record?.['email_address_id']);
    const safeIdentifier = optionalString(record?.['safe_identifier']);
    const phoneNumberId = optionalString(record?.['phone_number_id']);
    factors.push({
      strategy,
      ...(emailAddressId ? { emailAddressId } : {}),
      ...(safeIdentifier ? { safeIdentifier } : {}),
      ...(phoneNumberId ? { phoneNumberId } : {}),
    });
  }
  return factors;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set<ClerkSignInStatus>([
  'needs_identifier',
  'needs_first_factor',
  'needs_second_factor',
  'needs_new_password',
  'complete',
]);

export function parseSignInResponse(payload: unknown): ClerkSignIn {
  const envelope = asRecord(payload);
  const resource = asRecord(envelope?.['response']) ?? envelope;
  const id = optionalString(resource?.['id']);
  const status = resource?.['status'];

  if (!id || typeof status !== 'string' || !KNOWN_STATUSES.has(status)) {
    throw new ClerkAuthError(
      'unexpected',
      'The AGI account service returned a sign-in state AGI Desktop does not understand. ' +
        'Use the browser sign-in fallback below.',
    );
  }

  const firstFactorVerification = asRecord(resource?.['first_factor_verification']);

  return {
    id,
    status: status as ClerkSignInStatus,
    identifier: optionalString(resource?.['identifier']) ?? null,
    createdSessionId: optionalString(resource?.['created_session_id']) ?? null,
    supportedFirstFactors: parseFactors(resource?.['supported_first_factors']),
    supportedSecondFactors: parseFactors(resource?.['supported_second_factors']),
    externalVerificationRedirectUrl:
      optionalString(firstFactorVerification?.['external_verification_redirect_url']) ?? null,
    firstFactorVerificationStatus: optionalString(firstFactorVerification?.['status']) ?? null,
  };
}

export async function createPasswordSignIn(
  identifier: string,
  password: string,
): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', '/v1/client/sign_ins', {
      form: { identifier, password, strategy: 'password' },
      context: 'create',
    }),
  );
}

export async function createIdentifierSignIn(identifier: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', '/v1/client/sign_ins', {
      form: { identifier },
      context: 'create',
    }),
  );
}

export async function prepareEmailCode(
  signInId: string,
  emailAddressId: string,
): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/prepare_first_factor`, {
      form: { strategy: 'email_code', email_address_id: emailAddressId },
      context: 'prepare',
    }),
  );
}

export async function attemptEmailCode(signInId: string, code: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_first_factor`, {
      form: { strategy: 'email_code', code },
      context: 'first_factor',
    }),
  );
}

export async function attemptPassword(signInId: string, password: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_first_factor`, {
      form: { strategy: 'password', password },
      context: 'first_factor',
    }),
  );
}

export async function prepareSecondFactor(
  signInId: string,
  factor: ClerkSecondFactor,
): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/prepare_second_factor`, {
      form: {
        strategy: factor.strategy,
        ...(factor.phoneNumberId ? { phone_number_id: factor.phoneNumberId } : {}),
      },
      context: 'prepare',
    }),
  );
}

export async function attemptSecondFactor(
  signInId: string,
  strategy: string,
  code: string,
): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_second_factor`, {
      form: { strategy, code },
      context: 'second_factor',
    }),
  );
}

export async function createOauthSignIn(
  strategy: string,
  redirectUrl: string,
): Promise<{ signIn: ClerkSignIn; authorizationUrl: string }> {
  const signIn = parseSignInResponse(
    await request('POST', '/v1/client/sign_ins', {
      form: { strategy, redirect_url: redirectUrl },
      context: 'create',
    }),
  );

  if (!signIn.externalVerificationRedirectUrl) {
    throw new ClerkAuthError(
      'unexpected',
      'The AGI account service did not return a provider sign-in URL. Try email sign-in instead.',
    );
  }

  return { signIn, authorizationUrl: signIn.externalVerificationRedirectUrl };
}

export async function reloadSignInWithNonce(
  signInId: string,
  rotatingTokenNonce: string,
): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('GET', `/v1/client/sign_ins/${signInId}`, {
      search: `rotating_token_nonce=${encodeURIComponent(rotatingTokenNonce)}`,
      context: 'reload',
    }),
  );
}

export async function createSessionToken(sessionId: string): Promise<string> {
  const payload = await request('POST', `/v1/client/sessions/${sessionId}/tokens`, {
    form: {},
    context: 'session_token',
  });
  const envelope = asRecord(payload);
  const resource = asRecord(envelope?.['response']) ?? envelope;
  const jwt = optionalString(resource?.['jwt']);
  if (!jwt) {
    throw new ClerkAuthError(
      'unexpected',
      'The AGI account service did not return a session for this sign-in.',
    );
  }
  return jwt;
}

export function findEmailCodeFactor(signIn: ClerkSignIn): ClerkFirstFactor | null {
  return (
    signIn.supportedFirstFactors.find(
      (factor) => factor.strategy === 'email_code' && !!factor.emailAddressId,
    ) ?? null
  );
}
