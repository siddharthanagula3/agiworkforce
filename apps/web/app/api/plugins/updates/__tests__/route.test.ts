import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  userScopedDbMock,
  rateLimitMock,
  csrfMock,
  listPluginUpdateOffersMock,
  applyPluginUpdateMock,
  recordWorkspaceAuditEventMock,
} = vi.hoisted(() => ({
  userScopedDbMock: vi.fn(),
  rateLimitMock: vi.fn(),
  csrfMock: vi.fn(),
  listPluginUpdateOffersMock: vi.fn(),
  applyPluginUpdateMock: vi.fn(),
  recordWorkspaceAuditEventMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: recordWorkspaceAuditEventMock,
}));
vi.mock('@/lib/services/plugin-lifecycle', () => ({
  listPluginUpdateOffers: listPluginUpdateOffersMock,
  applyPluginUpdate: applyPluginUpdateMock,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

function get(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/updates');
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/updates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockResolvedValue(null);
  csrfMock.mockResolvedValue(null);
  recordWorkspaceAuditEventMock.mockResolvedValue(undefined);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/plugins/updates', () => {
  it('reports the caller’s pending plugin update offers', async () => {
    listPluginUpdateOffersMock.mockResolvedValue([
      { pluginId: 'research-pack', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updates).toEqual([
      { pluginId: 'research-pack', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ]);
    expect(listPluginUpdateOffersMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('returns the limiter response when rate limited, without listing', async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(listPluginUpdateOffersMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/plugins/updates', () => {
  it('applies the update to the caller’s own installation and audits it', async () => {
    applyPluginUpdateMock.mockResolvedValue({
      pluginId: 'research-pack',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      diff: { addedPermissions: [] },
      reEnabled: false,
    });

    const response = await POST(
      post({
        pluginId: 'research-pack',
        toVersion: '1.1.0',
        acknowledgedPermissions: ['connectors'],
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).update.toVersion).toBe('1.1.0');
    expect(applyPluginUpdateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        pluginId: 'research-pack',
        toVersion: '1.1.0',
        acknowledgedPermissions: ['connectors'],
      }),
    );
    expect(recordWorkspaceAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'plugin_setting_changed',
        detail: expect.objectContaining({ resourceId: 'research-pack', version: '1.1.0' }),
      }),
    );
  });

  it('returns the csrf response and never applies when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(post({ pluginId: 'research-pack', toVersion: '1.1.0' }));
    expect(response.status).toBe(403);
    expect(applyPluginUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 and never applies', async () => {
    const response = await POST(post({ pluginId: 'research-pack', toVersion: 'latest' }));
    expect(response.status).toBe(400);
    expect(applyPluginUpdateMock).not.toHaveBeenCalled();
  });
});
