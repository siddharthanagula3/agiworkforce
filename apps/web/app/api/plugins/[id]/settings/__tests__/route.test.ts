import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  csrfMock,
  rateLimitMock,
  getNeonDbMock,
  getPluginInstallationSettingsMock,
  updatePluginInstallationSettingsMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  getPluginInstallationSettingsMock: vi.fn(),
  updatePluginInstallationSettingsMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  getPluginInstallationSettings: getPluginInstallationSettingsMock,
  updatePluginInstallationSettings: updatePluginInstallationSettingsMock,
}));

import { NextRequest } from 'next/server';
import { GET, PATCH } from '../route';

const SETTINGS = {
  pluginId: 'engineering-pack',
  enabledSkills: ['code-review', 'systematic-debugging'],
  examplePrompts: ['Review this pull request for bugs and style issues.'],
  connectors: [{ connectorId: 'github', connected: false }],
  agents: [],
};

function get(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/engineering-pack/settings', {
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function patch(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/plugins/engineering-pack/settings', {
    method: 'PATCH',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

describe('GET /api/plugins/[id]/settings', () => {
  it('reports enabled skills, example prompts, and connector connect state', async () => {
    getPluginInstallationSettingsMock.mockResolvedValue(SETTINGS);
    const response = await GET(get(), params('engineering-pack'));
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toEqual(SETTINGS);
  });

  it('404s when the plugin is not installed', async () => {
    getPluginInstallationSettingsMock.mockResolvedValue(null);
    const response = await GET(get(), params('engineering-pack'));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('PLUGIN_NOT_INSTALLED');
  });
});

describe('PATCH /api/plugins/[id]/settings', () => {
  it('updates the enabled skill subset', async () => {
    updatePluginInstallationSettingsMock.mockResolvedValue({
      ...SETTINGS,
      enabledSkills: ['code-review'],
    });
    const response = await PATCH(
      patch({ enabledSkills: ['code-review'] }),
      params('engineering-pack'),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).settings.enabledSkills).toEqual(['code-review']);
    expect(updatePluginInstallationSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'engineering-pack',
      { enabledSkills: ['code-review'] },
    );
  });

  it('clears a custom example prompt override with null', async () => {
    updatePluginInstallationSettingsMock.mockResolvedValue(SETTINGS);
    const response = await PATCH(patch({ customExamplePrompts: null }), params('engineering-pack'));
    expect(response.status).toBe(200);
    expect(updatePluginInstallationSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'engineering-pack',
      { customExamplePrompts: null },
    );
  });

  it('rejects an unknown field with 400 and never mutates', async () => {
    const response = await PATCH(patch({ pluginId: 'other' }), params('engineering-pack'));
    expect(response.status).toBe(400);
    expect(updatePluginInstallationSettingsMock).not.toHaveBeenCalled();
  });

  it('404s when the plugin is not installed', async () => {
    updatePluginInstallationSettingsMock.mockResolvedValue(null);
    const response = await PATCH(patch({ enabledSkills: [] }), params('engineering-pack'));
    expect(response.status).toBe(404);
  });
});
