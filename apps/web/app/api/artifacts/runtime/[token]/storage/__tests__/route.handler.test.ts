import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertAccountActive: vi.fn(),
  readRunnableArtifact: vi.fn(),
  readArtifactStorageValue: vi.fn(),
  writeArtifactStorageValue: vi.fn(),
  deleteArtifactStorageValue: vi.fn(),
  listArtifactStorageKeys: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  ARTIFACT_STORAGE_LIST_LIMIT: 1_000,
  ArtifactRuntimeRouteUnavailableError: class ArtifactRuntimeRouteUnavailableError extends Error {},
  buildArtifactConnectorPlan: vi.fn(),
  completeArtifactPrompt: vi.fn(),
  describeArtifactConnectors: vi.fn(),
  selectArtifactRuntimeRoute: vi.fn(),
  ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES: 20 * 1024 * 1024,
  ARTIFACT_STORAGE_VALUE_LIMIT_BYTES: 4 * 1024 * 1024,
  readRunnableArtifact: mocks.readRunnableArtifact,
  readArtifactStorageValue: mocks.readArtifactStorageValue,
  writeArtifactStorageValue: mocks.writeArtifactStorageValue,
  deleteArtifactStorageValue: mocks.deleteArtifactStorageValue,
  listArtifactStorageKeys: mocks.listArtifactStorageKeys,
}));
vi.mock('@/lib/services/published-artifact-service', () => ({
  MAX_CONTENT_CHARS: 1_000_000,
  MAX_PUBLISHED_PER_USER: vi.fn(),
  PUBLISHABLE_KINDS: vi.fn(),
  PUBLISHED_ARTIFACT_VISIBILITIES: vi.fn(),
  PublishedArtifactOwnershipError: class PublishedArtifactOwnershipError extends Error {},
  PublishedArtifactQuotaError: class PublishedArtifactQuotaError extends Error {},
  PublishedArtifactValidationError: class PublishedArtifactValidationError extends Error {},
  buildPublishedArtifactUrl: vi.fn(),
  getPublishedArtifactByToken: vi.fn(),
  isPublishableKind: vi.fn(),
  isPublishedArtifactVisibility: vi.fn(),
  listPublishedArtifactVersions: vi.fn(),
  listPublishedArtifacts: vi.fn(),
  mintPublishToken: vi.fn(),
  publishArtifactRecord: vi.fn(),
  readPublishedArtifactVersion: vi.fn(),
  recordPublishedVersion: vi.fn(),
  requiresSandboxedRender: vi.fn(),
  setPublishedArtifactVisibility: vi.fn(),
  unpublishArtifactRecord: vi.fn(),
  unpublishArtifactsForConversations: vi.fn(),
  PUBLISHED_TOKEN_REGEX: /^[A-Za-z0-9_-]{24}$/,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const TOKEN = 'Abcdefghijklmnopqrstuv_1';
const ARTIFACT = { token: TOKEN, ownerId: 'owner-9' };

function call(body: unknown, token = TOKEN) {
  return POST(
    new NextRequest(`http://localhost/api/artifacts/runtime/${token}/storage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1', organizationId: null });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.readRunnableArtifact.mockResolvedValue(ARTIFACT);
  mocks.readArtifactStorageValue.mockResolvedValue('42');
  mocks.writeArtifactStorageValue.mockResolvedValue('saved');
  mocks.deleteArtifactStorageValue.mockResolvedValue(true);
  mocks.listArtifactStorageKeys.mockResolvedValue(['score', 'streak']);
});

describe('POST /api/artifacts/runtime/[token]/storage', () => {
  it('answers 404 for a malformed token before any auth', async () => {
    const response = await call({ op: 'get', key: 'score' }, 'nope');

    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await call({ op: 'get', key: 'score' });

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call({ op: 'get', key: 'score' });

    expect(response.status).toBe(401);
    expect(mocks.readRunnableArtifact).not.toHaveBeenCalled();
  });

  it('refuses a suspended account', async () => {
    mocks.assertAccountActive.mockRejectedValue(createError.forbidden('Account unavailable'));

    const response = await call({ op: 'get', key: 'score' });

    expect(response.status).toBe(403);
    expect(mocks.readRunnableArtifact).not.toHaveBeenCalled();
  });

  it('rejects an unknown operation', async () => {
    const response = await call({ op: 'drop', key: 'score' });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_storage_request');
  });

  it('answers 404 when the app is no longer runnable', async () => {
    mocks.readRunnableArtifact.mockResolvedValue(null);

    const response = await call({ op: 'get', key: 'score' });

    expect(response.status).toBe(404);
    expect(mocks.readArtifactStorageValue).not.toHaveBeenCalled();
  });

  it('refuses a value over the per-value limit without writing', async () => {
    const body = JSON.stringify({ op: 'set', key: 'blob', value: 'x'.repeat(4 * 1024 * 1024 + 1) });
    const response = await POST(
      new NextRequest(`http://localhost/api/artifacts/runtime/${TOKEN}/storage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
        body,
      }),
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(response.status).toBe(413);
    expect(mocks.writeArtifactStorageValue).not.toHaveBeenCalled();
  });

  it('refuses a write that would exceed the scope limit', async () => {
    mocks.writeArtifactStorageValue.mockResolvedValue('over_limit');

    const response = await call({ op: 'set', key: 'score', value: '1', shared: true });

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('storage_limit_reached');
  });

  it('reads a personal value for the caller', async () => {
    const response = await call({ op: 'get', key: 'score' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ key: 'score', value: '42', shared: false });
    expect(mocks.readArtifactStorageValue).toHaveBeenCalledWith(mocks.db, {
      artifact: ARTIFACT,
      userId: 'user-1',
      scope: 'personal',
      key: 'score',
    });
  });

  it('writes a shared value under the shared scope', async () => {
    const response = await call({ op: 'set', key: 'score', value: '7', shared: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: 'score', value: '7', shared: true });
    expect(mocks.writeArtifactStorageValue).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId: 'user-1', scope: 'shared', key: 'score', value: '7' }),
    );
  });

  it('deletes and lists keys', async () => {
    const removed = await call({ op: 'delete', key: 'score' });
    expect(await removed.json()).toEqual({ key: 'score', deleted: true, shared: false });

    const listed = await call({ op: 'list', prefix: 's' });
    expect(await listed.json()).toEqual({ keys: ['score', 'streak'], prefix: 's', shared: false });
    expect(mocks.listArtifactStorageKeys).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId: 'user-1', scope: 'personal', prefix: 's' }),
    );
  });
});
