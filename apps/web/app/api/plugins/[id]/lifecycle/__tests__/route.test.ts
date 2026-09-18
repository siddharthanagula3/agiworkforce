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
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
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
    rollbackPluginMock.mockResolvedValue({ restoredVersion: '1.0.0' });
    const response = await POST(post(PLUGIN_ID, { action: 'rollback' }), params(PLUGIN_ID));
    expect(response.status).toBe(200);
    expect(rollbackPluginMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pluginId: PLUGIN_ID, actorUserId: 'admin-1' }),
    );
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
