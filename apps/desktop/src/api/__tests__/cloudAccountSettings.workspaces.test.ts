import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  assertManagedCloudBoundary: vi.fn(),
}));

vi.mock('../cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.agi.example',
}));

vi.mock('../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
}));

import { getCloudOrganizationOverview, setActiveCloudWorkspace } from '../cloudAccountSettings';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('desktop cloud workspace switching (UI-86)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer desktop-device-token',
      'Content-Type': 'application/json',
    });
    mocks.createManagedCloudRequestContext.mockReturnValue({
      fetch: mocks.cloudFetch,
      getHeaders: mocks.getAuthHeaders,
      assertBoundary: mocks.assertManagedCloudBoundary,
    });
  });

  it('surfaces the workspace memberships and the active selection from the overview', async () => {
    mocks.cloudFetch.mockResolvedValue(
      jsonResponse({
        organization: null,
        access: { canManageTeam: true },
        activeOrganizationId: 'ws-acme',
        workspaces: [
          { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
          { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
          { name: 'missing id' },
        ],
      }),
    );

    const overview = await getCloudOrganizationOverview();

    expect(overview.activeOrganizationId).toBe('ws-acme');
    expect(overview.workspaces).toEqual([
      { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
      { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
    ]);
  });

  it('defaults to a personal selection with no memberships when the payload omits them', async () => {
    mocks.cloudFetch.mockResolvedValue(jsonResponse({ organization: null, access: {} }));

    const overview = await getCloudOrganizationOverview();

    expect(overview.activeOrganizationId).toBeNull();
    expect(overview.workspaces).toEqual([]);
  });

  it('writes the selection to the active-workspace endpoint', async () => {
    mocks.cloudFetch.mockResolvedValue(
      jsonResponse({ activeOrganizationId: 'ws-acme', scope: 'organization' }),
    );

    await setActiveCloudWorkspace('ws-acme');

    const [url, init] = mocks.cloudFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cloud.agi.example/api/settings/organization/active');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ organizationId: 'ws-acme' });
    expect(mocks.assertManagedCloudBoundary).toHaveBeenCalled();
  });

  it('sends an explicit null to return to the personal workspace', async () => {
    mocks.cloudFetch.mockResolvedValue(
      jsonResponse({ activeOrganizationId: null, scope: 'personal' }),
    );

    await setActiveCloudWorkspace(null);

    const [, init] = mocks.cloudFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ organizationId: null });
  });

  it('reports the server message when the switch is refused', async () => {
    mocks.cloudFetch.mockResolvedValue(jsonResponse({ error: 'Select a valid workspace' }, 400));

    await expect(setActiveCloudWorkspace('ws-acme')).rejects.toThrow('Select a valid workspace');
  });
});
