const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { fetchWorkspaceOverview, setActiveWorkspace } from '@/src/features/team';

describe('mobile workspace switching service (UI-86)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
  });

  it('reads the memberships and the active selection from the overview payload', async () => {
    mockGet.mockResolvedValue({
      organization: null,
      access: { plan: 'team', canManageTeam: true, maxMembers: 5 },
      activeOrganizationId: 'ws-acme',
      workspaces: [
        { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
        { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
        { name: 'missing id' },
      ],
    });

    const overview = await fetchWorkspaceOverview();

    expect(overview.activeWorkspaceId).toBe('ws-acme');
    expect(overview.workspaces).toEqual([
      { id: 'ws-acme', name: 'Acme Research', slug: 'acme', role: 'admin' },
      { id: 'ws-globex', name: 'Globex', slug: 'globex', role: 'member' },
    ]);
  });

  it('treats a payload without memberships as a personal-only account', async () => {
    mockGet.mockResolvedValue({ organization: null, access: {} });

    const overview = await fetchWorkspaceOverview();

    expect(overview.activeWorkspaceId).toBeNull();
    expect(overview.workspaces).toEqual([]);
  });

  it('puts the chosen workspace to the active-workspace endpoint', async () => {
    await setActiveWorkspace('ws-acme');
    expect(mockPut).toHaveBeenCalledWith('/api/settings/organization/active', {
      organizationId: 'ws-acme',
    });

    await setActiveWorkspace(null);
    expect(mockPut).toHaveBeenLastCalledWith('/api/settings/organization/active', {
      organizationId: null,
    });
  });
});
