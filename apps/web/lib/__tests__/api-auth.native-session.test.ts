import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';

import { resetSessionStartCache } from '@/lib/auth/session-age';
import { createIdentityTokenSigner, serveIdentitySigningKeys } from '@/test/clerk-signed-tokens';

type DataLayerModule = typeof import('@agiworkforce/data-layer');
type LoggerModule = typeof import('@/lib/logger');
type SessionSightingsModule = typeof import('@/lib/server/session-sightings');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type FakeRow = Record<string, unknown>;

const fakes = vi.hoisted(() => {
  const query = vi.fn();
  const execute = vi.fn();
  const getSession = vi.fn();
  const adapter = {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    execute: (sql: string, params?: unknown[]) => execute(sql, params),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(adapter),
    withUser: () => adapter,
    withOrg: () => adapter,
    dispose: () => undefined,
  };
  return { query, execute, getSession, adapter };
});

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/session-sightings', async (importOriginal) => ({
  ...(await importOriginal<SessionSightingsModule>()),
  noteSessionSighting: vi.fn(),
}));

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal()),
  getKeyValueStore: vi.fn(() => null),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null, sessionId: null, getToken: async () => null }),
  clerkClient: async () => ({
    sessions: {
      getSession: (...args: unknown[]) => fakes.getSession(...args),
      revokeSession: async () => undefined,
    },
  }),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => fakes.adapter),
}));

vi.mock('@agiworkforce/data-layer', async (importOriginal) => ({
  ...(await importOriginal<DataLayerModule>()),
  createDatabaseClient: vi.fn(() => fakes.adapter),
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import { getClerkAuthUser } from '@/lib/api-auth';

const WEB_ORIGIN = 'https://agiworkforce.com';
const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnop';
const FOREIGN_ORIGIN = 'https://evil.example';
const ALLOWLIST = [WEB_ORIGIN, EXTENSION_ORIGIN];
const SUBJECT = 'phone-user';
const SESSION_ID = 'sess_mobile_signed';
const EXPIRED = { ageSeconds: 600 };

const instance = createIdentityTokenSigner();
const forger = createIdentityTokenSigner();

const sessionToken = (claims: Record<string, unknown> = {}) =>
  instance.sign({ sub: SUBJECT, sid: SESSION_ID, ...claims });
const surfaceProof = (claims: Record<string, unknown> = {}) =>
  instance.sign({ sub: SUBJECT, surface: 'mobile', ...claims });

function request(bearer: string, proof?: string): NextRequest {
  return new NextRequest('http://localhost/api/terms/accept', {
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(proof === undefined ? {} : { [SURFACE_TOKEN_HEADER]: proof }),
    },
  });
}

/** The account bridge and lifecycle reads a subject needs before it authenticates. */
async function accountRows(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
  const s = sql.toLowerCase();
  if (s.includes('left join public.identities')) {
    return [{ identity_id: null, account_id: params[2] ?? null, erased: false }];
  }
  if (s.includes('account_status')) {
    return [{ account_status: null, deletion_scheduled_for: null, erased: false }];
  }
  return [];
}

function authFailureReasons(): string[] {
  return fakes.execute.mock.calls
    .filter(([sql]) => String(sql).includes('INSERT INTO security_audit_logs'))
    .map(([, params]) => String((params as unknown[]).find((p) => String(p).includes('reason'))));
}

const PHONE = {
  userId: SUBJECT,
  sessionIdentity: { subject: SUBJECT, sessionId: SESSION_ID },
  boundSurface: 'mobile',
};

describe("getClerkAuthUser against the provider's own verifier", () => {
  beforeEach(() => {
    resetSessionStartCache();
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_native_session');
    vi.stubEnv('CLERK_AUTHORIZED_PARTIES', ALLOWLIST.join(','));
    serveIdentitySigningKeys(instance);
    fakes.query.mockImplementation(accountRows);
    fakes.execute.mockResolvedValue(0);
    fakes.getSession.mockResolvedValue({
      id: SESSION_ID,
      userId: SUBJECT,
      status: 'active',
      createdAt: Date.now() - 60_000,
      lastActiveAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('a browser token, which names its origin', () => {
    it.each([
      ['the web origin', WEB_ORIGIN, 'web'],
      ['the extension origin', EXTENSION_ORIGIN, 'chrome'],
    ])('is admitted for %s and bound to it', async (_label, azp, bound) => {
      await expect(getClerkAuthUser(request(sessionToken({ azp })))).resolves.toEqual({
        userId: SUBJECT,
        sessionIdentity: { subject: SUBJECT, sessionId: SESSION_ID },
        boundSurface: bound,
      });
      expect(authFailureReasons()).toEqual([]);
    });

    it.each([
      ['with no surface proof', false],
      ['beside a valid origin-less surface proof', true],
    ])('is refused for an origin off the allowlist %s', async (_label, withProof) => {
      const bearer = sessionToken({ azp: FOREIGN_ORIGIN });

      await expect(
        getClerkAuthUser(request(bearer, withProof ? surfaceProof() : undefined)),
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(fakes.getSession).not.toHaveBeenCalled();
      expect(authFailureReasons()).toEqual([]);
    });

    it('takes its surface from a proof minted on an allowlisted origin, as before', async () => {
      await expect(
        getClerkAuthUser(
          request(sessionToken({ azp: WEB_ORIGIN }), surfaceProof({ azp: WEB_ORIGIN })),
        ),
      ).resolves.toEqual(PHONE);
    });

    it('is not rescued by an origin-less proof: its proof stays on the default check', async () => {
      await expect(
        getClerkAuthUser(request(sessionToken({ azp: WEB_ORIGIN }), surfaceProof())),
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(authFailureReasons().join()).toContain('invalid_surface_token');
    });
  });

  describe('a native token, which names no origin', () => {
    it('is admitted beside an origin-less surface proof and bound to the phone', async () => {
      await expect(getClerkAuthUser(request(sessionToken(), surfaceProof()))).resolves.toEqual(
        PHONE,
      );
      expect(authFailureReasons()).toEqual([]);
      expect(fakes.getSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('is refused with no surface proof, and the refusal is recorded', async () => {
      await expect(getClerkAuthUser(request(sessionToken()))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(authFailureReasons().join()).toContain('native_session_without_surface_proof');
      expect(fakes.getSession).not.toHaveBeenCalled();
    });

    it.each([
      ['that is empty', () => ''],
      ['minted for a different user', () => surfaceProof({ sub: 'someone-else' })],
      ['minted for an origin off the allowlist', () => surfaceProof({ azp: FOREIGN_ORIGIN })],
      ['minted for an allowlisted origin', () => surfaceProof({ azp: WEB_ORIGIN })],
      ['that carries no surface claim', () => sessionToken()],
      ['for a surface no template binds', () => surfaceProof({ surface: 'web' })],
      ['that has expired', () => instance.sign({ sub: SUBJECT, surface: 'mobile' }, EXPIRED)],
      ['that another key signed', () => forger.sign({ sub: SUBJECT, surface: 'mobile' })],
    ])('is refused beside a surface proof %s', async (_label, proof) => {
      await expect(getClerkAuthUser(request(sessionToken(), proof()))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(authFailureReasons().join()).toContain('invalid_surface_token');
      expect(fakes.getSession).not.toHaveBeenCalled();
    });

    it.each([
      ['that has expired', () => instance.sign({ sub: SUBJECT, sid: SESSION_ID }, EXPIRED)],
      ['that another key signed', () => forger.sign({ sub: SUBJECT, sid: SESSION_ID })],
      ['that names no session', () => instance.sign({ sub: SUBJECT })],
    ])('is refused when it is one %s, even beside a valid proof', async (_label, bearer) => {
      await expect(getClerkAuthUser(request(bearer(), surfaceProof()))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(authFailureReasons()).toEqual([]);
      expect(fakes.getSession).not.toHaveBeenCalled();
    });

    it.each([
      ['with no proof', false],
      ['beside a valid proof', true],
    ])(
      'never stands in as the bearer when it is the surface template token %s',
      async (_label, withProof) => {
        await expect(
          getClerkAuthUser(request(surfaceProof(), withProof ? surfaceProof() : undefined)),
        ).rejects.toMatchObject({ statusCode: 401 });
        expect(authFailureReasons().join()).toContain('surface_token_as_bearer');
        expect(fakes.getSession).not.toHaveBeenCalled();
      },
    );
  });
});
