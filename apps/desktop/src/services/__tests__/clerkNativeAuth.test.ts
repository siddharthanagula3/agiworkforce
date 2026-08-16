
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClerkAuthError,
  __setClerkNativeTransportForTests,
  attemptEmailCode,
  attemptSecondFactor,
  createIdentifierSignIn,
  createOauthSignIn,
  createPasswordSignIn,
  createSessionToken,
  findEmailCodeFactor,
  getClerkPublishableKey,
  isNativeClerkSignInConfigured,
  mapClerkFailure,
  parseSignInResponse,
  prepareEmailCode,
  prepareSecondFactor,
  reloadSignInWithNonce,
  resetClerkClient,
  type ClerkNativeTransportRequest,
  type ClerkNativeTransportResponse,
} from '../clerkNativeAuth';
import { useAppModeStore } from '../../stores/appModeStore';

const PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ';

function envStub(value: string | undefined) {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', value ?? '');
}

function signInBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    response: {
      object: 'sign_in',
      id: 'sia_1',
      status: 'complete',
      identifier: 'demo@example.com',
      created_session_id: 'sess_1',
      supported_first_factors: [],
      supported_second_factors: null,
      first_factor_verification: null,
      ...overrides,
    },
    client: {},
  });
}

describe('clerkNativeAuth wire contract', () => {
  let calls: ClerkNativeTransportRequest[];
  let respond: (request: ClerkNativeTransportRequest) => ClerkNativeTransportResponse;

  beforeEach(() => {
    envStub(PUBLISHABLE_KEY);
    useAppModeStore.setState({ mode: 'cloud' });
    resetClerkClient();
    calls = [];
    respond = () => ({ status: 200, body: signInBody() });
    __setClerkNativeTransportForTests(async (request) => {
      calls.push(request);
      return respond(request);
    });
  });

  afterEach(() => {
    __setClerkNativeTransportForTests(null);
    resetClerkClient();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reads the publishable key and reports configuration honestly', () => {
    expect(getClerkPublishableKey()).toBe(PUBLISHABLE_KEY);
    expect(isNativeClerkSignInConfigured()).toBe(true);

    envStub(undefined);
    expect(getClerkPublishableKey()).toBeNull();
    expect(isNativeClerkSignInConfigured()).toBe(false);

    envStub('sk_live_not_a_publishable_key');
    expect(getClerkPublishableKey()).toBeNull();
  });

  it('refuses to call Clerk when the build has no publishable key', async () => {
    envStub(undefined);
    await expect(createPasswordSignIn('demo@example.com', 'pw')).rejects.toMatchObject({
      kind: 'not_configured',
    });
    expect(calls).toHaveLength(0);
  });

  it('creates a password sign-in with the form-encoded body Clerk expects', async () => {
    const result = await createPasswordSignIn('demo@example.com', 'hunter2');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      publishableKey: PUBLISHABLE_KEY,
      method: 'POST',
      path: '/v1/client/sign_ins',
    });
    const body = new URLSearchParams(calls[0]!.body ?? '');
    expect(body.get('identifier')).toBe('demo@example.com');
    expect(body.get('password')).toBe('hunter2');
    expect(body.get('strategy')).toBe('password');
    expect(result.status).toBe('complete');
    expect(result.createdSessionId).toBe('sess_1');
  });

  it('carries the rotated client credential forward and never persists it', async () => {
    respond = () => ({ status: 200, body: signInBody(), clientToken: 'client_jwt_v2' });
    await createIdentifierSignIn('demo@example.com');

    respond = () => ({ status: 200, body: signInBody() });
    await createIdentifierSignIn('demo@example.com');
    expect(calls[1]?.clientToken).toBe('client_jwt_v2');

    resetClerkClient();
    await createIdentifierSignIn('demo@example.com');
    expect(calls[2]?.clientToken).toBeNull();
    expect(localStorage.getItem('clerk_client_jwt')).toBeNull();
  });

  it('prepares and attempts the email-code factor on the documented routes', async () => {
    respond = () => ({
      status: 200,
      body: signInBody({ status: 'needs_first_factor', created_session_id: null }),
    });
    await prepareEmailCode('sia_1', 'idn_9');
    expect(calls[0]?.path).toBe('/v1/client/sign_ins/sia_1/prepare_first_factor');
    const prepareBody = new URLSearchParams(calls[0]!.body ?? '');
    expect(prepareBody.get('strategy')).toBe('email_code');
    expect(prepareBody.get('email_address_id')).toBe('idn_9');

    respond = () => ({ status: 200, body: signInBody() });
    await attemptEmailCode('sia_1', '424242');
    expect(calls[1]?.path).toBe('/v1/client/sign_ins/sia_1/attempt_first_factor');
    const attemptBody = new URLSearchParams(calls[1]!.body ?? '');
    expect(attemptBody.get('strategy')).toBe('email_code');
    expect(attemptBody.get('code')).toBe('424242');
  });

  it('prepares and attempts second factors', async () => {
    respond = () => ({
      status: 200,
      body: signInBody({ status: 'needs_second_factor', created_session_id: null }),
    });
    await prepareSecondFactor('sia_1', { strategy: 'phone_code', phoneNumberId: 'idn_p' });
    expect(calls[0]?.path).toBe('/v1/client/sign_ins/sia_1/prepare_second_factor');
    expect(new URLSearchParams(calls[0]!.body ?? '').get('phone_number_id')).toBe('idn_p');

    respond = () => ({ status: 200, body: signInBody() });
    await attemptSecondFactor('sia_1', 'totp', '123456');
    expect(calls[1]?.path).toBe('/v1/client/sign_ins/sia_1/attempt_second_factor');
    const mfaBody = new URLSearchParams(calls[1]!.body ?? '');
    expect(mfaBody.get('strategy')).toBe('totp');
    expect(mfaBody.get('code')).toBe('123456');
  });

  it('mints a session token from the session resource', async () => {
    respond = () => ({
      status: 200,
      body: JSON.stringify({ response: { object: 'token', jwt: 'header.payload.signature' } }),
    });

    await expect(createSessionToken('sess_1')).resolves.toBe('header.payload.signature');
    expect(calls[0]?.path).toBe('/v1/client/sessions/sess_1/tokens');
    expect(calls[0]?.method).toBe('POST');
  });

  it('reports a session response with no jwt instead of returning an empty token', async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ response: { object: 'token' } }) });
    await expect(createSessionToken('sess_1')).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('starts an SSO sign-in and returns the provider URL', async () => {
    respond = () => ({
      status: 200,
      body: signInBody({
        status: 'needs_first_factor',
        created_session_id: null,
        first_factor_verification: {
          status: 'unverified',
          strategy: 'oauth_google',
          external_verification_redirect_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        },
      }),
    });

    const { authorizationUrl } = await createOauthSignIn(
      'oauth_google',
      'agiworkforce://sso-callback',
    );
    expect(authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const body = new URLSearchParams(calls[0]!.body ?? '');
    expect(body.get('strategy')).toBe('oauth_google');
    expect(body.get('redirect_url')).toBe('agiworkforce://sso-callback');
  });

  it('fails an SSO start that returns no provider URL rather than opening nothing', async () => {
    respond = () => ({
      status: 200,
      body: signInBody({ status: 'needs_first_factor', created_session_id: null }),
    });
    await expect(
      createOauthSignIn('oauth_google', 'agiworkforce://sso-callback'),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('reloads an SSO sign-in with the rotating nonce as a query parameter', async () => {
    respond = () => ({ status: 200, body: signInBody() });
    await reloadSignInWithNonce('sia_1', 'nonce value/1');

    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.path).toBe('/v1/client/sign_ins/sia_1');
    expect(calls[0]?.search).toBe('rotating_token_nonce=nonce%20value%2F1');
  });

  it('turns a thrown transport into a network failure, not a rejection', async () => {
    __setClerkNativeTransportForTests(async () => {
      throw new Error('connection refused');
    });

    const failure = await createPasswordSignIn('demo@example.com', 'pw').catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ClerkAuthError);
    expect((failure as ClerkAuthError).kind).toBe('network');
    expect((failure as ClerkAuthError).message).toMatch(/could not reach/i);
    expect((failure as ClerkAuthError).message).not.toMatch(/reject|denied|incorrect/i);
  });

  it('reports an unreadable transport payload', async () => {
    __setClerkNativeTransportForTests(
      async () => ({ nope: true }) as unknown as ClerkNativeTransportResponse,
    );
    await expect(createPasswordSignIn('demo@example.com', 'pw')).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('refuses to reach the account service from the Local trust boundary', async () => {
    useAppModeStore.setState({ mode: 'local' });

    const failure = await createPasswordSignIn('demo@example.com', 'pw').catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ClerkAuthError);
    expect((failure as ClerkAuthError).message).toMatch(/unavailable in local mode/i);
    expect(calls).toHaveLength(0);
  });

  it('reports a 200 with unparseable JSON', async () => {
    respond = () => ({ status: 200, body: 'not json' });
    await expect(createPasswordSignIn('demo@example.com', 'pw')).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });
});

describe('clerkNativeAuth failure mapping', () => {
  function clerkError(code: string, longMessage = 'Clerk says so.') {
    return JSON.stringify({ errors: [{ code, message: 'short', long_message: longMessage }] });
  }

  it.each([
    ['form_password_incorrect', 'invalid_credentials', /password is not correct/i],
    ['form_identifier_not_found', 'identifier_not_found', /no agi account exists/i],
    ['form_code_incorrect', 'invalid_code', /code is not correct/i],
    ['verification_failed', 'invalid_code', /code is not correct/i],
    ['verification_expired', 'code_expired', /expired/i],
    ['identifier_not_verified', 'email_unverified', /not been verified/i],
    ['form_identifier_not_verified', 'email_unverified', /not been verified/i],
    ['session_exists', 'unexpected', /already in progress/i],
  ] as const)('maps %s to a fixed %s message', (code, kind, pattern) => {
    const mapped = mapClerkFailure(422, clerkError(code), 'first_factor');
    expect(mapped.kind).toBe(kind);
    expect(mapped.message).toMatch(pattern);
    expect(mapped.clerkCode).toBe(code);
  });

  it.each([
    ['user_locked', 'account_locked'],
    ['strategy_for_user_invalid', 'invalid_credentials'],
    ['form_param_format_invalid', 'invalid_credentials'],
  ] as const)('classifies %s as %s while keeping Clerk’s wording', (code, kind) => {
    const mapped = mapClerkFailure(422, clerkError(code, 'Clerk explains the problem.'), 'create');
    expect(mapped.kind).toBe(kind);
    expect(mapped.message).toBe('Clerk explains the problem.');
    expect(mapped.clerkCode).toBe(code);
  });

  it('still classifies user_locked when Clerk sends no long message', () => {
    const mapped = mapClerkFailure(
      422,
      JSON.stringify({ errors: [{ code: 'user_locked' }] }),
      'create',
    );
    expect(mapped.kind).toBe('account_locked');
    expect(mapped.message).toMatch(/temporarily locked/i);
  });

  it('maps 429 to a rate limit, never to a bad password', () => {
    const mapped = mapClerkFailure(429, '{}', 'create');
    expect(mapped.kind).toBe('rate_limited');
    expect(mapped.message).toMatch(/too many sign-in attempts/i);
    expect(mapped.message).not.toMatch(/password/i);
  });

  it.each([500, 502, 503, 504])(
    'states HTTP %s as a service fault and never as a rejection',
    (status) => {
      const mapped = mapClerkFailure(status, clerkError('anything'), 'create');
      expect(mapped.kind).toBe('server_error');
      expect(mapped.status).toBe(status);
      expect(mapped.message).toContain(`HTTP ${status}`);
      expect(mapped.message).toMatch(/fault on the service/i);
      expect(mapped.message).not.toMatch(/reject|denied|incorrect|not correct|no agi account/i);
    },
  );

  it('keeps Clerk’s own wording for an unrecognised 4xx instead of inventing one', () => {
    const mapped = mapClerkFailure(
      400,
      clerkError('some_new_clerk_code', 'Your account needs attention.'),
      'create',
    );
    expect(mapped.kind).toBe('unexpected');
    expect(mapped.message).toBe('Your account needs attention.');
  });

  it('falls back to an honest generic message when Clerk sends no error body', () => {
    const mapped = mapClerkFailure(400, 'not json', 'session_token');
    expect(mapped.kind).toBe('unexpected');
    expect(mapped.message).toMatch(/HTTP 400/);
    expect(mapped.message).toMatch(/while finishing sign-in/);
  });
});

describe('clerkNativeAuth response parsing', () => {
  it('parses supported factors from the snake_case wire shape', () => {
    const parsed = parseSignInResponse({
      response: {
        id: 'sia_2',
        status: 'needs_first_factor',
        identifier: 'demo@example.com',
        created_session_id: null,
        supported_first_factors: [
          { strategy: 'password' },
          { strategy: 'email_code', email_address_id: 'idn_1', safe_identifier: 'd***@e.com' },
        ],
        supported_second_factors: [{ strategy: 'totp' }],
      },
    });

    expect(parsed.id).toBe('sia_2');
    expect(parsed.supportedFirstFactors).toHaveLength(2);
    expect(parsed.supportedSecondFactors).toEqual([{ strategy: 'totp' }]);
    expect(findEmailCodeFactor(parsed)).toMatchObject({
      strategy: 'email_code',
      emailAddressId: 'idn_1',
      safeIdentifier: 'd***@e.com',
    });
  });

  it('returns null when the account has no email-code factor', () => {
    const parsed = parseSignInResponse({
      response: {
        id: 'sia_3',
        status: 'needs_first_factor',
        supported_first_factors: [{ strategy: 'password' }],
      },
    });
    expect(findEmailCodeFactor(parsed)).toBeNull();
  });

  it('refuses an unknown status instead of coercing it into a state with no UI', () => {
    expect(() =>
      parseSignInResponse({ response: { id: 'sia_4', status: 'needs_something_new' } }),
    ).toThrowError(ClerkAuthError);
    expect(() => parseSignInResponse({ response: { status: 'complete' } })).toThrowError(
      ClerkAuthError,
    );
  });
});
