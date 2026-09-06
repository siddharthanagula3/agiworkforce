import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  csrfMock,
  rateLimitMock,
  getNeonDbMock,
  installMarketplaceEntryMock,
  listMarketplaceInstallationsMock,
  setMarketplaceInstallationEnabledMock,
  getMarketplaceInstallationSettingsMock,
  updateMarketplaceInstallationSettingsMock,
  installDirectoryPluginMock,
  uninstallDirectoryInstallationMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getNeonDbMock: vi.fn(),
  installMarketplaceEntryMock: vi.fn(),
  listMarketplaceInstallationsMock: vi.fn(),
  setMarketplaceInstallationEnabledMock: vi.fn(),
  getMarketplaceInstallationSettingsMock: vi.fn(),
  updateMarketplaceInstallationSettingsMock: vi.fn(),
  installDirectoryPluginMock: vi.fn(),
  uninstallDirectoryInstallationMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/services/plugin-marketplace-installation-service', () => ({
  installMarketplaceEntry: installMarketplaceEntryMock,
  listMarketplaceInstallations: listMarketplaceInstallationsMock,
  setMarketplaceInstallationEnabled: setMarketplaceInstallationEnabledMock,
  getMarketplaceInstallationSettings: getMarketplaceInstallationSettingsMock,
  updateMarketplaceInstallationSettings: updateMarketplaceInstallationSettingsMock,
  getMarketplaceInstallation: async () => null,
}));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  isMissingPluginMarketplaceSchema: (error: unknown) =>
    (error as { code?: string } | null)?.code === '42P01',
  getMarketplaceEntryForUser: async () => null,
}));
vi.mock('@/features/plugins/server/directory/install', () => ({
  installDirectoryPlugin: installDirectoryPluginMock,
  uninstallDirectoryInstallation: uninstallDirectoryInstallationMock,
}));

import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '../[id]/route';
import { GET as getSettings, PATCH as patchSettings } from '../[id]/settings/route';
import { GET, POST } from '../route';

const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const INSTALLS_DISABLED = 'Plugin installs are not enabled on this deployment yet';

const INSTALLATION = {
  id: INSTALLATION_ID,
  entryId: ENTRY_ID,
  sourceId: '11111111-1111-4111-8111-111111111111',
  pluginKey: 'acme-support-bundle',
  installedVersion: '1.0.0',
  enabled: true,
  enabledSkills: ['code-review'],
  customExamplePrompts: null,
  installedAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const SETTINGS = {
  pluginId: 'acme-support-bundle',
  enabledSkills: ['code-review'],
  examplePrompts: ['Summarize this ticket.'],
  connectors: [{ connectorId: 'github', connected: true }],
  agents: ['triage-agent'],
};

function undefinedTableError(): Error & { code: string } {
  return Object.assign(new Error('relation does not exist'), { code: '42P01' });
}

function get(path = '/api/plugins/marketplace-installations'): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    headers: { origin: 'https://agiworkforce.com' },
  });
}

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    method: 'POST',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    method: 'PATCH',
    headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(path: string): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
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

describe('GET /api/plugins/marketplace-installations', () => {
  it('lists the caller’s marketplace installations', async () => {
    listMarketplaceInstallationsMock.mockResolvedValue([INSTALLATION]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect((await response.json()).installations).toEqual([INSTALLATION]);
  });

  it('answers 503 with the plain sentence while the marketplace schema is absent', async () => {
    listMarketplaceInstallationsMock.mockRejectedValue(undefinedTableError());
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe(INSTALLS_DISABLED);
  });
});

describe('POST /api/plugins/marketplace-installations (install)', () => {
  it('installs a registered marketplace entry and returns 201', async () => {
    installMarketplaceEntryMock.mockResolvedValue(INSTALLATION);
    const response = await POST(
      post('/api/plugins/marketplace-installations', { entryId: ENTRY_ID }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).installation).toEqual(INSTALLATION);
    expect(installDirectoryPluginMock).not.toHaveBeenCalled();
  });

  it('installs a directory plugin by id and returns the installation with its skills', async () => {
    installDirectoryPluginMock.mockResolvedValue({
      status: 'installed',
      installation: { ...INSTALLATION, pluginKey: 'adobe-for-creativity' },
      skills: ['background-removal'],
    });
    const response = await POST(
      post('/api/plugins/marketplace-installations', { pluginId: 'adobe-for-creativity' }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.installation.pluginKey).toBe('adobe-for-creativity');
    expect(body.skills).toEqual(['background-removal']);
    expect(installDirectoryPluginMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'adobe-for-creativity',
    );
    expect(installMarketplaceEntryMock).not.toHaveBeenCalled();
  });

  it('maps every directory install outcome to a status and a sentence', async () => {
    const cases = [
      {
        result: { status: 'missing', message: 'This plugin is not in the directory.' },
        status: 404,
      },
      { result: { status: 'builtin', message: 'built-in' }, status: 409 },
      {
        result: {
          status: 'blocked',
          message: 'needs the CLI',
          installCommand: 'claude plugin install x@y',
        },
        status: 409,
      },
      { result: { status: 'skills-unavailable', message: 'no skills' }, status: 502 },
    ];
    for (const testCase of cases) {
      installDirectoryPluginMock.mockResolvedValueOnce(testCase.result);
      const response = await POST(
        post('/api/plugins/marketplace-installations', { pluginId: 'x' }),
      );
      expect(response.status).toBe(testCase.status);
      const body = await response.json();
      expect(body.error.message).toBe(testCase.result.message);
      if ('installCommand' in testCase.result) {
        expect(body.error.installCommand).toBe(testCase.result.installCommand);
      }
    }
  });

  it('rejects a non-uuid entry id, a malformed plugin id and a body with both', async () => {
    for (const body of [
      { entryId: 'not-a-uuid' },
      { pluginId: 'Not Valid' },
      { entryId: ENTRY_ID, pluginId: 'x' },
      {},
    ]) {
      const response = await POST(post('/api/plugins/marketplace-installations', body));
      expect(response.status).toBe(400);
    }
    expect(installMarketplaceEntryMock).not.toHaveBeenCalled();
    expect(installDirectoryPluginMock).not.toHaveBeenCalled();
  });

  it('409s when the entry is not installable', async () => {
    installMarketplaceEntryMock.mockResolvedValue(null);
    const response = await POST(
      post('/api/plugins/marketplace-installations', { entryId: ENTRY_ID }),
    );
    expect(response.status).toBe(409);
  });

  it('answers 503 with the plain sentence while the marketplace schema is absent', async () => {
    installDirectoryPluginMock.mockRejectedValue(undefinedTableError());
    const response = await POST(post('/api/plugins/marketplace-installations', { pluginId: 'x' }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe(INSTALLS_DISABLED);
  });
});

describe('PATCH /api/plugins/marketplace-installations/[id]', () => {
  it('flips the enabled flag', async () => {
    setMarketplaceInstallationEnabledMock.mockResolvedValue({ ...INSTALLATION, enabled: false });
    const response = await PATCH(
      patch(`/api/plugins/marketplace-installations/${INSTALLATION_ID}`, { enabled: false }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).installation.enabled).toBe(false);
  });

  it('404s when the installation does not exist', async () => {
    setMarketplaceInstallationEnabledMock.mockResolvedValue(null);
    const response = await PATCH(
      patch(`/api/plugins/marketplace-installations/${INSTALLATION_ID}`, { enabled: true }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/plugins/marketplace-installations/[id]', () => {
  it('uninstalls through the directory-aware path and returns 204', async () => {
    uninstallDirectoryInstallationMock.mockResolvedValue(true);
    const response = await DELETE(
      del(`/api/plugins/marketplace-installations/${INSTALLATION_ID}`),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(204);
    expect(uninstallDirectoryInstallationMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      INSTALLATION_ID,
    );
  });

  it('404s when nothing was installed to remove', async () => {
    uninstallDirectoryInstallationMock.mockResolvedValue(false);
    const response = await DELETE(
      del(`/api/plugins/marketplace-installations/${INSTALLATION_ID}`),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(404);
  });

  it('answers 503 with the plain sentence while the marketplace schema is absent', async () => {
    uninstallDirectoryInstallationMock.mockRejectedValue(undefinedTableError());
    const response = await DELETE(
      del(`/api/plugins/marketplace-installations/${INSTALLATION_ID}`),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe(INSTALLS_DISABLED);
  });
});

describe('GET /api/plugins/marketplace-installations/[id]/settings', () => {
  it('reports enabled skills, example prompts, connectors, and agents', async () => {
    getMarketplaceInstallationSettingsMock.mockResolvedValue(SETTINGS);
    const response = await getSettings(
      get(`/api/plugins/marketplace-installations/${INSTALLATION_ID}/settings`),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toEqual(SETTINGS);
  });

  it('404s when the installation does not exist', async () => {
    getMarketplaceInstallationSettingsMock.mockResolvedValue(null);
    const response = await getSettings(
      get(`/api/plugins/marketplace-installations/${INSTALLATION_ID}/settings`),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/plugins/marketplace-installations/[id]/settings', () => {
  it('updates enabled skills', async () => {
    updateMarketplaceInstallationSettingsMock.mockResolvedValue({
      ...SETTINGS,
      enabledSkills: [],
    });
    const response = await patchSettings(
      patch(`/api/plugins/marketplace-installations/${INSTALLATION_ID}/settings`, {
        enabledSkills: [],
      }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).settings.enabledSkills).toEqual([]);
  });

  it('rejects an unknown field with 400', async () => {
    const response = await patchSettings(
      patch(`/api/plugins/marketplace-installations/${INSTALLATION_ID}/settings`, {
        pluginId: 'x',
      }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(400);
    expect(updateMarketplaceInstallationSettingsMock).not.toHaveBeenCalled();
  });
});
