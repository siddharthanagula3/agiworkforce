import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  userScopedDbMock,
  csrfMock,
  rateLimitMock,
  getMarketplaceInstallationSettingsMock,
  updateMarketplaceInstallationSettingsMock,
} = vi.hoisted(() => ({
  userScopedDbMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  getMarketplaceInstallationSettingsMock: vi.fn(),
  updateMarketplaceInstallationSettingsMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/services/plugin-marketplace-installation-service', () => ({
  getMarketplaceInstallationSettings: getMarketplaceInstallationSettingsMock,
  updateMarketplaceInstallationSettings: updateMarketplaceInstallationSettingsMock,
}));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  getMarketplaceEntryForUser: vi.fn(async () => null),
  isMissingPluginMarketplaceSchema: (error: unknown) =>
    (error as { code?: string } | null)?.code === '42P01',
  assertMarketplaceEntryInstallable: vi.fn(async () => undefined),
  approveMarketplaceInstallationPermissions: vi.fn(async () => []),
}));

import { NextRequest } from 'next/server';
import { GET, PATCH } from '../route';

const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
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

function get(id: string): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/plugins/marketplace-installations/${id}/settings`,
    {
      headers: { origin: 'https://agiworkforce.com' },
    },
  );
}

function patch(id: string, body: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/plugins/marketplace-installations/${id}/settings`,
    {
      method: 'PATCH',
      headers: { origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/plugins/marketplace-installations/[id]/settings', () => {
  it('reports the installation settings', async () => {
    getMarketplaceInstallationSettingsMock.mockResolvedValue(SETTINGS);
    const response = await GET(get(INSTALLATION_ID), params(INSTALLATION_ID));
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toEqual(SETTINGS);
  });

  it('404s on a malformed id without calling the service', async () => {
    const response = await GET(get('not-a-uuid'), params('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(getMarketplaceInstallationSettingsMock).not.toHaveBeenCalled();
  });

  it('404s when the installation does not exist', async () => {
    getMarketplaceInstallationSettingsMock.mockResolvedValue(null);
    const response = await GET(get(INSTALLATION_ID), params(INSTALLATION_ID));
    expect(response.status).toBe(404);
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    getMarketplaceInstallationSettingsMock.mockRejectedValue(undefinedTableError());
    const response = await GET(get(INSTALLATION_ID), params(INSTALLATION_ID));
    expect(response.status).toBe(503);
  });
});

describe('PATCH /api/plugins/marketplace-installations/[id]/settings', () => {
  it('updates enabled skills and returns the new settings', async () => {
    updateMarketplaceInstallationSettingsMock.mockResolvedValue({ ...SETTINGS, enabledSkills: [] });
    const response = await PATCH(
      patch(INSTALLATION_ID, { enabledSkills: [] }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).settings.enabledSkills).toEqual([]);
    expect(updateMarketplaceInstallationSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      INSTALLATION_ID,
      { enabledSkills: [] },
    );
  });

  it('rejects an unknown field with 400 and never updates', async () => {
    const response = await PATCH(
      patch(INSTALLATION_ID, { pluginId: 'x' }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(400);
    expect(updateMarketplaceInstallationSettingsMock).not.toHaveBeenCalled();
  });

  it('returns the csrf response and never updates when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await PATCH(
      patch(INSTALLATION_ID, { enabledSkills: [] }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(403);
    expect(updateMarketplaceInstallationSettingsMock).not.toHaveBeenCalled();
  });

  it('answers 503 while the marketplace schema is absent', async () => {
    updateMarketplaceInstallationSettingsMock.mockRejectedValue(undefinedTableError());
    const response = await PATCH(
      patch(INSTALLATION_ID, { enabledSkills: [] }),
      params(INSTALLATION_ID),
    );
    expect(response.status).toBe(503);
  });
});
