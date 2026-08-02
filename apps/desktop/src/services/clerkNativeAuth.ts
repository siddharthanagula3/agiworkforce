/**
 * Native Clerk Frontend API client for AGI Desktop sign-in.
 *
 * ## Why this exists
 *
 * Desktop used to reuse the CLI's RFC 8628 device-authorization grant: open a
 * child window at the web app's `/auth/device` page and poll. On a real build
 * that child window carries no Clerk browser cookie, so its approval button
 * hangs on "Checking…" forever; the page renders unstyled; and a server 500 was
 * surfaced to the user as "AGI Cloud rejected the device sign-in request",
 * blaming the account for a server fault. Desktop ships a browser engine, so it
 * can authenticate the user directly instead.
 *
 * ## The contract, and where every part of it was verified
 *
 * Everything below is read out of the Clerk SDKs installed in this repo — no
 * endpoint here is guessed.
 *
 * - **Frontend API host** — `node_modules/@clerk/shared` `keys.ts`:
 *   `pk_live_`/`pk_test_` + unpadded base64 of `"<frontendApi>$"`. Decoded in
 *   Rust (`sys/account/clerk_native.rs`), which is also the SSRF boundary.
 * - **Request envelope** — `@clerk/clerk-js@6.25.3` FapiClient: base
 *   `https://{frontendApi}/v1{path}`, query `__clerk_api_version=2026-05-12`
 *   and `_clerk_js_version=6.25.3`, body `application/x-www-form-urlencoded`.
 * - **Native mode** — `@clerk/expo`
 *   `dist/provider/singleton/createClerkInstance.js`: append `_is_native=1`,
 *   omit cookies, send the client JWT in the `authorization` REQUEST header,
 *   and read the rotated client JWT from the `authorization` RESPONSE header.
 * - **Sign-in resource** — `@clerk/clerk-js` `SignIn`: `POST
 *   /v1/client/sign_ins`, then `…/{id}/prepare_first_factor`,
 *   `…/{id}/attempt_first_factor`, `…/{id}/prepare_second_factor`,
 *   `…/{id}/attempt_second_factor`; statuses `needs_identifier`,
 *   `needs_first_factor`, `needs_second_factor`, `needs_new_password`,
 *   `complete`.
 * - **Session token** — `@clerk/clerk-js` `Session`/`Token`: `POST
 *   /v1/client/sessions/{id}/tokens` → `{ jwt }`.
 * - **SSO** — `@clerk/expo` `dist/hooks/useSSO.js`: create the sign-in with
 *   `strategy=oauth_*` + `redirect_url`, open
 *   `first_factor_verification.external_verification_redirect_url`, then reload
 *   the sign-in with the callback's `rotating_token_nonce`.
 * - **Error envelope** — `@clerk/clerk-js` `ClerkAPIError`:
 *   `{ errors: [{ code, message, long_message, meta: { param_name } }] }`.
 * - **Captcha** — `SignIn.shouldRequireCaptcha` returns true only when
 *   `signUpIfMissing` is set. Plain sign-in create needs no captcha token, so a
 *   native client without a captcha widget is a supported caller.
 *
 * ## Credential discipline
 *
 * Passwords, one-time codes, MFA codes, the Clerk client JWT and the Clerk
 * session JWT are never logged, never written to disk here, and never sent
 * anywhere but the Clerk Frontend API. The client JWT lives in module memory
 * for the duration of one sign-in ceremony and is dropped by `resetClerkClient`
 * when the ceremony ends. Durable AGI Cloud credentials are stored by the
 * existing native vault in `cloudAccountAuth`, not here.
 */

/** Clerk sign-in statuses this client understands. */
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
  /** Present for `oauth_*` / `enterprise_sso` first factors. */
  externalVerificationRedirectUrl: string | null;
  firstFactorVerificationStatus: string | null;
}

/**
 * Every way native sign-in can fail, as a closed set.
 *
 * The critical distinction this type exists to enforce: `server_error` and
 * `network` are NOT `rejected`. Mapping a 5xx onto a rejection message is the
 * exact defect this rewrite removes.
 */
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

/** Raw transport result. Mirrors `ClerkNativeHttpResponse` on the Rust side. */
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

/**
 * Publishable key for the Clerk instance the AGI web app uses.
 *
 * Same instance, same users: `apps/web` reads
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and Desktop must be pointed at the same
 * value via `VITE_CLERK_PUBLISHABLE_KEY`. When it is unset, native sign-in
 * reports `not_configured` and the caller falls back to the device-code path
 * rather than pretending to work.
 */
export function getClerkPublishableKey(): string | null {
  const raw = (import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] as string | undefined)?.trim();
  if (!raw) return null;
  if (!raw.startsWith('pk_live_') && !raw.startsWith('pk_test_')) return null;
  return raw;
}

export function isNativeClerkSignInConfigured(): boolean {
  return getClerkPublishableKey() !== null;
}

/**
 * Default transport: the native Rust command.
 *
 * A Clerk production instance validates the browser `Origin` header against the
 * instance's allowed origins, and the Tauri webview origin is not one of them —
 * a direct `fetch` from the webview would be answered `origin_invalid`. The
 * native client sends no `Origin`, matching how Clerk's own React Native client
 * talks to FAPI.
 */
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

/** Test seam. Production code never calls this. */
export function __setClerkNativeTransportForTests(transport: ClerkNativeTransport | null): void {
  transportOverride = transport;
}

// The Clerk native client JWT for the in-flight ceremony. Memory only.
let clientToken: string | null = null;

/** Drop the in-memory Clerk client credential. */
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

/**
 * Map a Clerk failure onto an honest, user-facing message.
 *
 * Rules that are deliberate, not incidental:
 * - `>= 500` is always `server_error` and always says the account service
 *   failed. It must never read as a credential or account rejection.
 * - `429` is `rate_limited`, not "wrong password".
 * - An unrecognised 4xx keeps Clerk's own `long_message`/`message` verbatim
 *   rather than inventing a friendlier lie.
 */
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

  // Trust boundary. This transport runs in Rust, OUTSIDE `guardedFetch`, so it
  // does not inherit the webview egress guard — this IS the guard for it. Cloud
  // sign-in only ever runs from the Cloud workspace; Local and BYOK must never
  // reach our account service, and Local needs no account at all. Lazy import
  // keeps the privacyBoundary → appModeStore cycle broken.
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
    // A thrown transport is a transport failure — never an account decision.
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

/**
 * Parse the `sign_in` resource out of a FAPI envelope.
 *
 * Clerk answers `{ response: <resource>, client: <client> }`. An unknown status
 * throws rather than being coerced — a silently mis-parsed status is how a
 * sign-in screen ends up in a state nobody wrote UI for.
 */
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

/** Start a sign-in with a password. */
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

/** Start a sign-in that will be completed with an emailed one-time code. */
export async function createIdentifierSignIn(identifier: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', '/v1/client/sign_ins', {
      form: { identifier },
      context: 'create',
    }),
  );
}

/** Ask Clerk to email the one-time code for this sign-in. */
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

/** Submit the emailed one-time code. */
export async function attemptEmailCode(signInId: string, code: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_first_factor`, {
      form: { strategy: 'email_code', code },
      context: 'first_factor',
    }),
  );
}

/** Submit the password when the sign-in was created without one. */
export async function attemptPassword(signInId: string, password: string): Promise<ClerkSignIn> {
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_first_factor`, {
      form: { strategy: 'password', password },
      context: 'first_factor',
    }),
  );
}

/** Ask Clerk to send the second-factor code (SMS). TOTP needs no prepare. */
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

/** Submit a second-factor code (`totp`, `phone_code`, or `backup_code`). */
export async function attemptSecondFactor(
  signInId: string,
  strategy: string,
  code: string,
): Promise<ClerkSignIn> {
  // `totp`, `phone_code`, and `backup_code` all submit under `code` — verified
  // against @clerk/clerk-js `SignIn.attemptSecondFactor`, which spreads the
  // params object straight onto the request body.
  return parseSignInResponse(
    await request('POST', `/v1/client/sign_ins/${signInId}/attempt_second_factor`, {
      form: { strategy, code },
      context: 'second_factor',
    }),
  );
}

/**
 * Start an OAuth/SSO sign-in and return the URL to open in the system browser.
 *
 * Google, Microsoft, and Apple all forbid OAuth inside embedded webviews, so
 * this hop to the real browser is unavoidable and is the one accepted exception
 * to native sign-in.
 */
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

/**
 * Re-read the sign-in after the browser hop.
 *
 * `rotating_token_nonce` comes back on the deep-link callback and is what
 * authorises this reload for a native client. Per `@clerk/expo`'s own comment,
 * Clerk only appends the nonce when the redirect URL is allowlisted on the
 * instance.
 */
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

/** Mint a session JWT for a completed sign-in. */
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

/**
 * Pick the email-code factor for an identifier, if the account has one.
 *
 * Returns `null` when Clerk did not offer `email_code` — the caller must then
 * say so plainly rather than showing a code box that can never be satisfied.
 */
export function findEmailCodeFactor(signIn: ClerkSignIn): ClerkFirstFactor | null {
  return (
    signIn.supportedFirstFactors.find(
      (factor) => factor.strategy === 'email_code' && !!factor.emailAddressId,
    ) ?? null
  );
}
