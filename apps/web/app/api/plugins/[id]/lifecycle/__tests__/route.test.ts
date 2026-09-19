import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  csrfMock,
  rateLimitMock,
  getNeonDbMock,
  listPluginVersionsMock,
  listPluginLifecycleEventsMock,
  submitPluginVersionForReviewMock,
  publishPluginVersionMock,
  deprecatePluginVersionMock,
  suspendPluginVersionMock,
  rollbackPluginMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  listPluginVersionsMock: vi.fn(),
  listPluginLifecycleEventsMock: vi.fn(),
  submitPluginVersionForReviewMock: vi.fn(),
  publishPluginVersionMock: vi.fn(),
  deprecatePluginVersionMock: vi.fn(),
  suspendPluginVersionMock: vi.fn(),
  rollbackPluginMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: recordAuditEventMock,
}));
vi.mock('@/lib/services/plugin-lifecycle', () => ({
  listPluginVersions: listPluginVersionsMock,
  listPluginLifecycleEvents: listPluginLifecycleEventsMock,
  submitPluginVersionForReview: submitPluginVersionForReviewMock,
  publishPluginVersion: publishPluginVersionMock,
  deprecatePluginVersion: deprecatePluginVersionMock,
  suspendPluginVersion: suspendPluginVersionMock,
  rollbackPlugin: rollbackPluginMock,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

const PLUGIN_ID = 'research-pack';

function get(id = PLUGIN_ID): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/plugins/${id}/lifecycle`);
}

function post(id: string, body: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/plugins/${id}/lifecycle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue({ userId: 'admin-1' });
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
  recordAuditEventMock.mockResolvedValue(undefined);
});

describe('GET /api/plugins/[id]/lifecycle', () => {
  it('lists the versions and events for the plugin', async () => {
    listPluginVersionsMock.mockResolvedValue([{ version: '1.0.0' }]);
    listPluginLifecycleEventsMock.mockResolvedValue([{ action: 'publish' }]);
    const response = await GET(get(), params(PLUGIN_ID));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pluginId).toBe(PLUGIN_ID);
    expect(body.versions).toEqual([{ version: '1.0.0' }]);
    expect(body.events).toEqual([{ action: 'publish' }]);
  });

  it('refuses a caller who is not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValue(new Error('not an admin'));
    const response = await GET(get(), params(PLUGIN_ID));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(listPluginVersionsMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed plugin id with 400 and never lists', async () => {
    const response = await GET(get('Not Valid!'), params('Not Valid!'));
    expect(response.status).toBe(400);
    expect(listPluginVersionsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/plugins/[id]/lifecycle', () => {
  it('submits a version for review', async () => {
    submitPluginVersionForReviewMock.mockResolvedValue({ version: '1.1.0', status: 'in_review' });
    const response = await POST(
      post(PLUGIN_ID, { action: 'submit', version: '1.1.0' }),
      params(PLUGIN_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).version).toEqual({ version: '1.1.0', status: 'in_review' });
    expect(submitPluginVersionForReviewMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pluginId: PLUGIN_ID, version: '1.1.0', actorUserId: 'admin-1' }),
    );
  });

  it('publishes a version with the optional manifest fields', async () => {
    publishPluginVersionMock.mockResolvedValue({ version: '1.1.0', status: 'published' });
    const response = await POST(
      post(PLUGIN_ID, {
        action: 'publish',
        version: '1.1.0',
        manifestUrl: 'https://example.com/manifest.json',
        changelog: 'Fixes.',
      }),
      params(PLUGIN_ID),
    );
    expect(response.status).toBe(200);
    expect(publishPluginVersionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pluginId: PLUGIN_ID,
        version: '1.1.0',
        manifestUrl: 'https://example.com/manifest.json',
        changelog: 'Fixes.',
      }),
    );
  });

  it('rolls back the plugin', async () => {
    rollbackPluginMock.mockResolvedValue({
      restored: { version: '1.0.0' },
      from: '1.1.0',
      installationsMoved: 2,
    });
    const response = await POST(post(PLUGIN_ID, { action: 'rollback' }), params(PLUGIN_ID));
    expect(response.status).toBe(200);
    expect(rollbackPluginMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pluginId: PLUGIN_ID, actorUserId: 'admin-1' }),
    );
  });

  it('records every lifecycle action in the platform audit trail', async () => {
    suspendPluginVersionMock.mockResolvedValue({
      version: { version: '1.1.0', status: 'suspended' },
      installationsStopped: 3,
    });
    const response = await POST(
      post(PLUGIN_ID, { action: 'suspend', version: '1.1.0', reason: 'Leaks its token.' }),
      params(PLUGIN_ID),
    );

    expect(response.status).toBe(200);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        eventType: 'admin_policy_changed',
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'plugin',
          resourceId: PLUGIN_ID,
          version: '1.1.0',
          status: 'suspend',
          reason: 'Leaks its token.',
          count: 3,
        }),
      }),
    );
  });

  it('audits a deprecation with the reason members are owed', async () => {
    deprecatePluginVersionMock.mockResolvedValue({ version: '1.0.0', status: 'deprecated' });
    const response = await POST(
      post(PLUGIN_ID, { action: 'deprecate', version: '1.0.0', reason: 'Superseded.' }),
      params(PLUGIN_ID),
    );

    expect(response.status).toBe(200);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin_policy_changed',
        detail: expect.objectContaining({
          resourceId: PLUGIN_ID,
          version: '1.0.0',
          status: 'deprecate',
          reason: 'Superseded.',
        }),
      }),
    );
  });

  it('does not audit an action the lifecycle refused', async () => {
    publishPluginVersionMock.mockRejectedValue(new Error('cannot publish'));
    await POST(post(PLUGIN_ID, { action: 'publish', version: '1.1.0' }), params(PLUGIN_ID)).catch(
      () => undefined,
    );
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown action with 400 and never mutates', async () => {
    const response = await POST(post(PLUGIN_ID, { action: 'delete' }), params(PLUGIN_ID));
    expect(response.status).toBe(400);
    expect(submitPluginVersionForReviewMock).not.toHaveBeenCalled();
    expect(publishPluginVersionMock).not.toHaveBeenCalled();
  });

  it('returns the csrf response and never mutates when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(
      post(PLUGIN_ID, { action: 'submit', version: '1.1.0' }),
      params(PLUGIN_ID),
    );
    expect(response.status).toBe(403);
    expect(submitPluginVersionForReviewMock).not.toHaveBeenCalled();
  });
});
