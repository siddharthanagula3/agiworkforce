import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type RateLimitModule = typeof import('@/lib/rate-limit');
type ApiAuthModule = typeof import('@/lib/api-auth');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type ArtifactRuntimeServiceModule = typeof import('@/lib/services/artifact-runtime-service');
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
type ArtifactConnectorGateModule = typeof import('@/lib/services/artifact-connector-gate');

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertAccountActive: vi.fn(),
  readOwnedRunnableArtifact: vi.fn(),
  describeArtifactConnectors: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  gate: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/artifact-runtime-service', async (importOriginal) => ({
  ...(await importOriginal<ArtifactRuntimeServiceModule>()),
  readOwnedRunnableArtifact: mocks.readOwnedRunnableArtifact,
  describeArtifactConnectors: mocks.describeArtifactConnectors,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementResolutionModule>()),
  resolveEntitlementBundle: mocks.resolveEntitlementBundle,
}));
vi.mock('@/lib/services/artifact-connector-gate', async (importOriginal) => ({
  ...(await importOriginal<ArtifactConnectorGateModule>()),
  artifactConnectorsGateResponse: mocks.gate,
}));

import { GET } from '../route';

const ARTIFACT_ID = 'c0ffee00-0000-4000-8000-000000000001';
const OWNED = {
  artifactId: ARTIFACT_ID,
  conversationId: 'c0ffee00-0000-4000-8000-0000000000aa',
  messageId: 'c0ffee00-0000-4000-8000-0000000000bb',
  title: 'Weekly growth',
  type: 'html',
  originPrivacyMode: 'managed',
};

function call(connectors: string[], artifactId = ARTIFACT_ID) {
  const url = new URL(`http://localhost/api/artifacts/runtime/live/${artifactId}/connectors`);
  for (const connector of connectors) url.searchParams.append('connector', connector);
  return GET(new NextRequest(url), { params: Promise.resolve({ artifactId }) });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as { error?: { code?: string } };
  return payload.error?.code;
}

describe('GET /api/artifacts/runtime/live/[artifactId]/connectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.db,
      userId: 'user-1',
      organizationId: null,
    });
    mocks.assertAccountActive.mockResolvedValue(undefined);
    mocks.readOwnedRunnableArtifact.mockResolvedValue(OWNED);
    mocks.resolveEntitlementBundle.mockResolvedValue({ plan: 'pro' });
    mocks.gate.mockResolvedValue(null);
    mocks.describeArtifactConnectors.mockResolvedValue([{ id: 'github', ready: true }]);
  });

  it('refuses an id that is not an artifact id before authenticating', async () => {
    const response = await call(['github'], 'not-an-id');
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('stops at the rate limit for the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await call(['github'])).status).toBe(429);
    expect(mocks.assertAccountActive).toHaveBeenCalledWith('user-1', expect.any(NextRequest));
    expect(mocks.readOwnedRunnableArtifact).not.toHaveBeenCalled();
  });

  it('refuses a request that names no connected app', async () => {
    const response = await call([]);
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_connectors');
  });

  it('serves only an artifact the caller owns in the active workspace', async () => {
    mocks.readOwnedRunnableArtifact.mockResolvedValue(null);
    const response = await call(['github']);
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('artifact_not_found');
    expect(mocks.readOwnedRunnableArtifact).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId: 'user-1', organizationId: null }),
      ARTIFACT_ID,
    );
    expect(mocks.describeArtifactConnectors).not.toHaveBeenCalled();
  });

  it.each(['byok', 'local', null])(
    'refuses an artifact whose chat resolved to %s rather than managed cloud',
    async (originPrivacyMode) => {
      mocks.readOwnedRunnableArtifact.mockResolvedValue({ ...OWNED, originPrivacyMode });
      const response = await call(['github']);
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('artifact_outside_managed_cloud');
      expect(mocks.describeArtifactConnectors).not.toHaveBeenCalled();
    },
  );

  it('returns the plan gate refusal unchanged', async () => {
    mocks.gate.mockResolvedValue(
      NextResponse.json({ error: { code: 'plan_upgrade_required' } }, { status: 403 }),
    );
    const response = await call(['github']);
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('plan_upgrade_required');
    expect(mocks.describeArtifactConnectors).not.toHaveBeenCalled();
  });

  it('refuses when the plan cannot describe connectors', async () => {
    mocks.describeArtifactConnectors.mockResolvedValue(null);
    const response = await call(['github']);
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('connectors_unavailable');
  });

  it('describes each named connector once, without caching', async () => {
    const response = await call(['github', 'github']);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      connectors: [{ id: 'github', ready: true }],
    });
    expect(mocks.describeArtifactConnectors).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: null,
        planTier: 'pro',
        connectors: ['github'],
      }),
    );
  });
});
