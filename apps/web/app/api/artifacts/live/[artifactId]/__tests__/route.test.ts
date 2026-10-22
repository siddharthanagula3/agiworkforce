import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertAccountActive: vi.fn(),
  recordAuditEvent: vi.fn(),
  readLiveArtifact: vi.fn(),
  readOwnedRunnableArtifact: vi.fn(),
  removeLiveArtifact: vi.fn(),
  saveLiveArtifact: vi.fn(),
  setLiveArtifactRefreshPolicy: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: mocks.assertAccountActive,
  getClerkAuthUser: vi.fn(),
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  ArtifactRuntimeRouteUnavailableError: class ArtifactRuntimeRouteUnavailableError extends Error {},
  buildArtifactConnectorPlan: vi.fn(),
  completeArtifactPrompt: vi.fn(),
  selectArtifactRuntimeRoute: vi.fn(),
  readLiveArtifact: mocks.readLiveArtifact,
  readOwnedRunnableArtifact: mocks.readOwnedRunnableArtifact,
  removeLiveArtifact: mocks.removeLiveArtifact,
  saveLiveArtifact: mocks.saveLiveArtifact,
  setLiveArtifactRefreshPolicy: mocks.setLiveArtifactRefreshPolicy,
}));

import { DELETE, GET, PATCH, PUT } from '../route';

const ARTIFACT_ID = 'c0ffee00-0000-4000-8000-000000000001';
const OWNED = {
  artifactId: ARTIFACT_ID,
  conversationId: 'c0ffee00-0000-4000-8000-0000000000aa',
  messageId: 'c0ffee00-0000-4000-8000-0000000000bb',
  title: 'Weekly growth',
  type: 'react',
  originPrivacyMode: 'managed',
};
const LIVE = {
  artifactId: ARTIFACT_ID,
  conversationId: OWNED.conversationId,
  title: 'Weekly growth',
  type: 'react',
  connectors: ['google_drive'],
  allowedTools: ['google_drive__search'],
  refreshPolicy: 'on_open',
  lastRefreshedAt: null,
  readiness: 'ready',
  missingConnectors: [],
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
};

function request(method: string, body?: unknown, artifactId = ARTIFACT_ID) {
  return [
    new NextRequest(`http://localhost/api/artifacts/live/${artifactId}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ artifactId }) },
  ] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.readOwnedRunnableArtifact.mockResolvedValue(OWNED);
  mocks.saveLiveArtifact.mockResolvedValue(LIVE);
  mocks.readLiveArtifact.mockResolvedValue(LIVE);
  mocks.removeLiveArtifact.mockResolvedValue(true);
  mocks.setLiveArtifactRefreshPolicy.mockResolvedValue({ ...LIVE, refreshPolicy: 'manual' });
});

describe('/api/artifacts/live/[artifactId]', () => {
  it('reads the binding without a CSRF token', async () => {
    const response = await GET(...request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ artifact: LIVE });
    expect(mocks.requireCsrfToken).not.toHaveBeenCalled();
    expect(mocks.assertAccountActive).toHaveBeenCalledWith('user-1', expect.any(NextRequest));
  });

  it('requires a CSRF token to bind', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const response = await PUT(
      ...request('PUT', { connectors: ['google_drive'], allowedTools: [] }),
    );
    expect(response.status).toBe(403);
    expect(mocks.saveLiveArtifact).not.toHaveBeenCalled();
  });

  it('refuses a binding with no connected app', async () => {
    const response = await PUT(...request('PUT', { connectors: [], allowedTools: [] }));
    expect(response.status).toBe(400);
    expect(mocks.saveLiveArtifact).not.toHaveBeenCalled();
  });

  it('binds only an artifact the caller owns', async () => {
    mocks.readOwnedRunnableArtifact.mockResolvedValue(null);
    const response = await PUT(
      ...request('PUT', { connectors: ['google_drive'], allowedTools: [] }),
    );
    expect(response.status).toBe(404);
    expect(mocks.saveLiveArtifact).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['byok', 'local', null])(
    'refuses to bind an artifact whose chat resolved to %s rather than managed cloud',
    async (originPrivacyMode) => {
      mocks.readOwnedRunnableArtifact.mockResolvedValue({ ...OWNED, originPrivacyMode });
      const response = await PUT(
        ...request('PUT', { connectors: ['google_drive'], allowedTools: [] }),
      );
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'artifact_outside_managed_cloud',
      );
      expect(mocks.saveLiveArtifact).not.toHaveBeenCalled();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('saves the binding and audits the connector grant', async () => {
    const response = await PUT(
      ...request('PUT', {
        connectors: ['google_drive'],
        allowedTools: ['google_drive__search'],
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.saveLiveArtifact).toHaveBeenCalledWith(mocks.db, {
      owner: expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      artifact: OWNED,
      connectors: ['google_drive'],
      allowedTools: ['google_drive__search'],
      refreshPolicy: null,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'connector_setting_changed',
        detail: expect.objectContaining({
          resourceType: 'live_artifact',
          resourceId: ARTIFACT_ID,
          status: 'live_artifact_bound',
          scopes: ['google_drive'],
        }),
      }),
    );
  });

  it('changes the refresh policy', async () => {
    const response = await PATCH(...request('PATCH', { refreshPolicy: 'manual' }));
    expect(response.status).toBe(200);
    expect(mocks.setLiveArtifactRefreshPolicy).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      ARTIFACT_ID,
      'manual',
    );
  });

  it('refuses an unknown refresh policy', async () => {
    const response = await PATCH(...request('PATCH', { refreshPolicy: 'hourly' }));
    expect(response.status).toBe(400);
  });

  it('removes the binding and audits the revocation', async () => {
    const response = await DELETE(...request('DELETE'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ artifact: null });
    expect(mocks.removeLiveArtifact).toHaveBeenCalledWith(mocks.db, 'user-1', ARTIFACT_ID);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'live_artifact_unbound' }),
      }),
    );
  });

  it('answers 404 when there is no binding to remove', async () => {
    mocks.removeLiveArtifact.mockResolvedValue(false);
    const response = await DELETE(...request('DELETE'));
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
