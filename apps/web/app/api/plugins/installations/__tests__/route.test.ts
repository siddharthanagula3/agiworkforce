import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  csrfMock,
  rateLimitMock,
  getNeonDbMock,
  installWebPluginMock,
  listPluginInstallationsMock,
  setWebPluginEnabledMock,
  uninstallWebPluginMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  installWebPluginMock: vi.fn(),
  listPluginInstallationsMock: vi.fn(),
  setWebPluginEnabledMock: vi.fn(),
  uninstallWebPluginMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  installWebPlugin: installWebPluginMock,
  listPluginInstallations: listPluginInstallationsMock,
  setWebPluginEnabled: setWebPluginEnabledMock,
  uninstallWebPlugin: uninstallWebPluginMock,
}));

import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '../[id]/route';
import { GET, POST } from '../route';

const INSTALLATION = {
  pluginId: 'research-pack',
  installedVersion: '1.0.0',
  enabled: true,
  installedAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

function get(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/installations', {
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/installations', {
    method: 'POST',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/installations/research-pack', {
    method: 'PATCH',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/installations/research-pack', {
    method: 'DELETE',
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authUserMock.mockResolvedValue({ userId: 'user-1' });
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
});

describe('GET /api/plugins/installations', () => {
  it('lists the caller’s installations', async () => {
    listPluginInstallationsMock.mockResolvedValue([INSTALLATION]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.installations).toEqual([INSTALLATION]);
    expect(listPluginInstallationsMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('returns the limiter response when rate limited, without listing', async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(listPluginInstallationsMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/plugins/installations (install)', () => {
  it('installs a plugin and returns 201', async () => {
    installWebPluginMock.mockResolvedValue(INSTALLATION);
    const response = await POST(post({ pluginId: 'research-pack' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.installation).toEqual(INSTALLATION);
    expect(installWebPluginMock).toHaveBeenCalledWith(expect.anything(), 'user-1', 'research-pack');
  });

  it('rejects an invalid plugin id with 400 and never installs', async () => {
    const response = await POST(post({ pluginId: 'Not Valid!' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_PLUGIN');
    expect(installWebPluginMock).not.toHaveBeenCalled();
  });

  it('reports 409 when the plugin is not web-installable', async () => {
    installWebPluginMock.mockResolvedValue(null);
    const response = await POST(post({ pluginId: 'github-automation' }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('PLUGIN_NOT_INSTALLABLE');
  });

  it('returns the csrf response and never installs when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(post({ pluginId: 'research-pack' }));
    expect(response.status).toBe(403);
    expect(installWebPluginMock).not.toHaveBeenCalled();
  });

  it('returns the limiter response and never installs when rate limited', async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await POST(post({ pluginId: 'research-pack' }));
    expect(response.status).toBe(429);
    expect(installWebPluginMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/plugins/installations/[id] (enable/disable)', () => {
  it('flips the enabled flag and returns the updated installation', async () => {
    setWebPluginEnabledMock.mockResolvedValue({ ...INSTALLATION, enabled: false });
    const response = await PATCH(patch({ enabled: false }), params('research-pack'));
    expect(response.status).toBe(200);
    expect((await response.json()).installation.enabled).toBe(false);
    expect(setWebPluginEnabledMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'research-pack',
      false,
    );
  });

  it('404s when the plugin was never installed', async () => {
    setWebPluginEnabledMock.mockResolvedValue(null);
    const response = await PATCH(patch({ enabled: true }), params('research-pack'));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('PLUGIN_NOT_INSTALLED');
  });

  it('rejects a non-boolean body with 400 and never mutates', async () => {
    const response = await PATCH(patch({ enabled: 'yes' }), params('research-pack'));
    expect(response.status).toBe(400);
    expect(setWebPluginEnabledMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/plugins/installations/[id] (uninstall)', () => {
  it('uninstalls and returns 204', async () => {
    uninstallWebPluginMock.mockResolvedValue(true);
    const response = await DELETE(del(), params('research-pack'));
    expect(response.status).toBe(204);
    expect(uninstallWebPluginMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'research-pack',
    );
  });

  it('404s when nothing was installed to remove', async () => {
    uninstallWebPluginMock.mockResolvedValue(false);
    const response = await DELETE(del(), params('research-pack'));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('PLUGIN_NOT_INSTALLED');
  });

  it('404s on a malformed id without calling the service', async () => {
    const response = await DELETE(del(), params('../../etc/passwd'));
    expect(response.status).toBe(404);
    expect(uninstallWebPluginMock).not.toHaveBeenCalled();
  });
});
