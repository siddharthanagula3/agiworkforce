import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';

import { createIdentityTokenSigner, serveIdentitySigningKeys } from '@/test/clerk-signed-tokens';

type RlsDbModule = typeof import('@/lib/server/rls-db');

const scopedDb = vi.hoisted(() => ({ getUserScopedDb: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null, sessionId: null, getToken: async () => null }),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: (...args: unknown[]) => scopedDb.getUserScopedDb(...args),
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';
process.env['CSRF_SECRET'] = 'native-session-csrf-secret-at-least-32-bytes';

import { resolveSessionsPrincipal } from '@/app/api/settings/sessions/session-principal';
import { isBearerTokenValid, validateCsrfFromRequest } from '@/lib/csrf';
import { checkRateLimit, clientIpRateLimitIdentifier } from '@/lib/rate-limit';
import { resolveDeviceCredentialLink } from '@/lib/server/device-credential-link';
import { verifyIdentitySessionToken } from '@/lib/server/identity';
import {
  verifyNativeSessionToken,
  verifyRequestSessionToken,
  verifySessionTokenWithSurfaceProof,
} from '@/lib/server/native-session-token';
import { readSessionFactorAge } from '@/lib/server/step-up/session-proof';

const WEB_ORIGIN = 'https://agiworkforce.com';
const FOREIGN_ORIGIN = 'https://evil.example';
const SUBJECT = 'phone-user';
const SESSION_ID = 'sess_mobile_signed';
const FIRST_FACTOR_MINUTES = 3;
const NO_SECOND_FACTOR = -1;

const instance = createIdentityTokenSigner();

const nativeSession = (claims: Record<string, unknown> = {}) =>
  instance.sign({
    sub: SUBJECT,
    sid: SESSION_ID,
    fva: [FIRST_FACTOR_MINUTES, NO_SECOND_FACTOR],
    ...claims,
  });
const nativeProof = (claims: Record<string, unknown> = {}) =>
  instance.sign({ sub: SUBJECT, surface: 'mobile', ...claims });

function phoneRequest(options: { proof?: string; method?: string } = {}): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/chat', {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${nativeSession()}`,
      ...(options.proof === undefined ? {} : { [SURFACE_TOKEN_HEADER]: options.proof }),
    },
  });
}

beforeEach(() => {
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_native_session');
  vi.stubEnv('CLERK_AUTHORIZED_PARTIES', WEB_ORIGIN);
  serveIdentitySigningKeys(instance);
  scopedDb.getUserScopedDb.mockResolvedValue({
    db: {},
    userId: SUBJECT,
    organizationId: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the strict verification every caller starts from', () => {
  it('refuses a native token, and takes nothing beside the token that could change that', async () => {
    await expect(verifyIdentitySessionToken(nativeSession())).resolves.toBeNull();
  });

  it('accepts a browser token minted on the allowlisted origin', async () => {
    await expect(
      verifyIdentitySessionToken(nativeSession({ azp: WEB_ORIGIN })),
    ).resolves.toMatchObject({ subject: SUBJECT, sessionId: SESSION_ID });
  });
});

describe('verifySessionTokenWithSurfaceProof', () => {
  it('is the strict verification and nothing more when the caller has no proof', async () => {
    await expect(verifySessionTokenWithSurfaceProof(nativeSession(), null)).resolves.toBeNull();
  });

  it('admits a native token beside its surface proof', async () => {
    await expect(
      verifySessionTokenWithSurfaceProof(nativeSession(), nativeProof()),
    ).resolves.toMatchObject({ subject: SUBJECT, sessionId: SESSION_ID });
  });

  it('accepts a browser token on the strict path whatever sits in the proof slot', async () => {
    await expect(
      verifySessionTokenWithSurfaceProof(nativeSession({ azp: WEB_ORIGIN }), 'not-a-token'),
    ).resolves.toMatchObject({ subject: SUBJECT });
  });

  it.each([
    ['a token minted for another origin', () => nativeSession({ azp: FOREIGN_ORIGIN })],
    ['the surface template token itself', () => nativeProof()],
    ['a token that names no session', () => instance.sign({ sub: SUBJECT })],
  ])('refuses %s even beside a valid proof', async (_label, bearer) => {
    await expect(verifySessionTokenWithSurfaceProof(bearer(), nativeProof())).resolves.toBeNull();
  });

  it.each([
    ['for another user', () => nativeProof({ sub: 'someone-else' })],
    ['minted on an allowlisted origin', () => nativeProof({ azp: WEB_ORIGIN })],
    ['minted on another origin', () => nativeProof({ azp: FOREIGN_ORIGIN })],
    ['with no surface claim', () => nativeSession()],
    ['that is not a token', () => 'not-a-token'],
  ])('refuses a native token beside a proof %s', async (_label, proof) => {
    await expect(verifySessionTokenWithSurfaceProof(nativeSession(), proof())).resolves.toBeNull();
  });
});

describe('verifyNativeSessionToken', () => {
  it('reports the bound surface with the claims', async () => {
    await expect(verifyNativeSessionToken(nativeSession(), nativeProof())).resolves.toMatchObject({
      admitted: true,
      boundSurface: 'mobile',
      claims: { subject: SUBJECT, sessionId: SESSION_ID },
    });
  });

  it('does not take a browser token: that one belongs on the strict path', async () => {
    await expect(
      verifyNativeSessionToken(nativeSession({ azp: WEB_ORIGIN }), nativeProof()),
    ).resolves.toEqual({ admitted: false, refusal: null });
  });

  it('names why a native token was refused', async () => {
    await expect(verifyNativeSessionToken(nativeSession(), null)).resolves.toEqual({
      admitted: false,
      refusal: 'native_session_without_surface_proof',
    });
    await expect(
      verifyNativeSessionToken(nativeSession(), nativeProof({ sub: 'someone-else' })),
    ).resolves.toEqual({ admitted: false, refusal: 'invalid_surface_token' });
    await expect(verifyNativeSessionToken(nativeProof(), nativeProof())).resolves.toEqual({
      admitted: false,
      refusal: 'surface_token_as_bearer',
    });
  });
});

describe('the request-scoped callers a phone reaches', () => {
  it('reads the proof from the request header', async () => {
    const token = nativeSession();
    await expect(
      verifyRequestSessionToken(phoneRequest({ proof: nativeProof() }), token),
    ).resolves.toMatchObject({ subject: SUBJECT });
    await expect(verifyRequestSessionToken(phoneRequest(), token)).resolves.toBeNull();
  });

  it('lets a proven phone request past the CSRF check and holds an unproven one to it', async () => {
    await expect(
      validateCsrfFromRequest(phoneRequest({ method: 'POST', proof: nativeProof() })),
    ).resolves.toBe(true);
    await expect(validateCsrfFromRequest(phoneRequest({ method: 'POST' }))).resolves.toBe(false);
    await expect(
      validateCsrfFromRequest(
        phoneRequest({ method: 'POST', proof: nativeProof({ sub: 'someone-else' }) }),
      ),
    ).resolves.toBe(false);
  });

  it('does not treat a native bearer as valid for a caller that passes no proof', async () => {
    const header = `Bearer ${nativeSession()}`;
    await expect(isBearerTokenValid(header)).resolves.toBe(false);
    await expect(isBearerTokenValid(header, nativeProof())).resolves.toBe(true);
  });

  it('buckets a proven phone request by its user and an unproven one by its address', async () => {
    const proven = phoneRequest({ proof: nativeProof() });
    const unproven = phoneRequest();

    await expect(checkRateLimit(proven, 'chat-message')).resolves.toMatchObject({
      identifier: `user:${SUBJECT}`,
    });
    await expect(checkRateLimit(unproven, 'chat-message')).resolves.toMatchObject({
      identifier: clientIpRateLimitIdentifier(unproven),
    });
  });

  it('reads the factor age for step-up from a proven phone session only', async () => {
    await expect(readSessionFactorAge(phoneRequest({ proof: nativeProof() }))).resolves.toEqual({
      firstFactorMinutes: FIRST_FACTOR_MINUTES,
      secondFactorMinutes: null,
    });
    await expect(readSessionFactorAge(phoneRequest())).resolves.toBeNull();
  });

  it('links a device to a proven phone session only', async () => {
    await expect(
      resolveDeviceCredentialLink(phoneRequest({ proof: nativeProof() }), SUBJECT),
    ).resolves.toEqual({ credentialFamilyId: null, identitySessionId: SESSION_ID });
    await expect(resolveDeviceCredentialLink(phoneRequest(), SUBJECT)).resolves.toEqual({
      credentialFamilyId: null,
      identitySessionId: null,
    });
  });

  it('names the current session only from a proven bearer, with the route gate ahead of it stubbed', async () => {
    await expect(
      resolveSessionsPrincipal(phoneRequest({ proof: nativeProof() })),
    ).resolves.toMatchObject({ userId: SUBJECT, currentSessionId: SESSION_ID });
    await expect(resolveSessionsPrincipal(phoneRequest())).resolves.toMatchObject({
      userId: SUBJECT,
      currentSessionId: null,
    });
  });
});
