
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    requireProviderDefaultModel: vi.fn().mockReturnValue('fixture-model'),
  };
});

vi.mock('../services/user-preferences', () => ({
  default: {
    getProfile: vi.fn().mockResolvedValue({ data: null }),
    getSettings: vi.fn().mockResolvedValue({ data: {} }),
    getAPIKeys: vi.fn().mockResolvedValue({ data: [] }),
    updateProfile: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
    uploadAvatar: vi.fn().mockResolvedValue({ data: '' }),
    changePassword: vi.fn().mockResolvedValue({}),
    createAPIKey: vi.fn().mockResolvedValue({ data: null }),
    deleteAPIKey: vi.fn().mockResolvedValue({}),
    get2FAStatus: vi.fn().mockResolvedValue({ data: { enabled: false } }),
    setup2FA: vi.fn().mockResolvedValue({ data: undefined }),
    verify2FA: vi.fn().mockResolvedValue({ success: false }),
    validateTOTPCode: vi.fn().mockResolvedValue({ valid: false }),
    disable2FA: vi.fn().mockResolvedValue({ success: false }),
    regenerateBackupCodes: vi.fn().mockResolvedValue({}),
    enable2FA: vi.fn().mockResolvedValue({}),
  },
  settingsService: {
    getProfile: vi.fn().mockResolvedValue({ data: null }),
    getSettings: vi.fn().mockResolvedValue({ data: {} }),
    getAPIKeys: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

async function setupMocks() {
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  const { getCsrfToken } = await import('@/lib/client/csrf');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  vi.mocked(getCsrfToken).mockResolvedValue('test-csrf-token');
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper() {
  const client = makeQueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

describe('useOrganizationSettings · renderHook (GET /api/settings/organization)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/organization with auth header and populates hook data', async () => {
    const ORG_ID = '11111111-1111-4111-8111-111111111111';
    const org = {
      id: ORG_ID,
      name: 'ACME',
      slug: 'acme',
      plan: 'free',
      memberCount: 2,
      maxMembers: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      currentUserRole: 'owner' as const,
    };
    const overview = {
      organization: org,
      activeOrganizationId: ORG_ID,
      workspaces: [
        {
          id: ORG_ID,
          name: 'ACME',
          slug: 'acme',
          role: 'owner' as const,
          joinedAt: '2026-01-01T00:00:00Z',
        },
      ],
      access: {
        plan: 'free',
        canManageTeam: true,
        maxMembers: 5,
        seatsConsumed: 2,
        seatsAvailable: 3,
        seatSource: 'billing' as const,
      },
    };
    fetchMock.mockResolvedValue(makeResponse(overview));

    const { useOrganizationSettings } = await import('./use-settings-queries');
    const { result } = renderHook(() => useOrganizationSettings(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/organization',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.current.data).toEqual(org);
  });

  it('surfaces error when server returns 403 · was previously silently null', async () => {
    fetchMock.mockResolvedValue(makeResponse({ error: 'Forbidden' }, 403));

    const { useOrganizationSettings } = await import('./use-settings-queries');
    const { result } = renderHook(() => useOrganizationSettings(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });
});

describe('team administration mutations · renderHook', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('creates a workspace through the real POST endpoint', async () => {
    const organization = {
      id: 'org-1',
      name: 'Demo Team',
      slug: 'demo-team',
      plan: 'team',
      memberCount: 1,
      maxMembers: null,
      createdAt: '2026-07-25T00:00:00Z',
      updatedAt: '2026-07-25T00:00:00Z',
      currentUserRole: 'owner',
    };
    fetchMock.mockResolvedValue(makeResponse({ organization }, 201));

    const { useCreateOrganization } = await import('./use-settings-queries');
    const { result } = renderHook(() => useCreateOrganization(), { wrapper: makeWrapper() });

    act(() => result.current.mutate({ name: 'Demo Team', slug: 'demo-team' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/organization',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
        body: JSON.stringify({ name: 'Demo Team', slug: 'demo-team' }),
      }),
    );
    expect(result.current.data).toEqual(organization);
  });

  it('preserves the actionable nested API message when an account email is unknown', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'No AGI account uses that email. Ask them to create an AGI account, then try again. No invitation was sent.',
          },
        },
        400,
      ),
    );

    const { useInviteTeamMember } = await import('./use-settings-queries');
    const { result } = renderHook(() => useInviteTeamMember(), { wrapper: makeWrapper() });

    act(() =>
      result.current.mutate({
        organizationId: 'org-1',
        email: 'unknown@example.com',
        role: 'member',
      }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toMatch(/create an AGI account/i);
    expect(result.current.error?.message).toMatch(/No invitation was sent/i);
  });
});

describe('useTeamMembers · renderHook (GET /api/settings/team)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/team?organizationId= with auth header and populates members', async () => {
    const members = [
      {
        id: 'org-1:u1',
        userId: 'u1',
        organizationId: 'org-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarUrl: null,
        role: 'admin',
        status: 'active',
        invitedAt: null,
        joinedAt: '2026-01-01T00:00:00Z',
        lastActiveAt: null,
        permissions: [],
      },
    ];
    fetchMock.mockResolvedValue(makeResponse({ members }));

    const { useTeamMembers } = await import('./use-settings-queries');
    const { result } = renderHook(() => useTeamMembers('org-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/team?organizationId=org-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.current.data).toEqual(members);
  });

  it('surfaces error when server returns 403 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValue(makeResponse({ error: 'Forbidden' }, 403));

    const { useTeamMembers } = await import('./use-settings-queries');
    const { result } = renderHook(() => useTeamMembers('org-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });

  it('does not fetch when organizationId is undefined (enabled: false)', async () => {
    const { useTeamMembers } = await import('./use-settings-queries');
    const { result } = renderHook(() => useTeamMembers(undefined), {
      wrapper: makeWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isPending).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useUserActivity · renderHook (GET /api/settings/activity)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/activity?limit=50 with auth header and populates activities', async () => {
    const activities = [
      {
        id: 'a1',
        userId: 'u1',
        type: 'login',
        description: 'Login',
        ipAddress: '1.2.3.4',
        userAgent: null,
        metadata: {},
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    fetchMock.mockResolvedValue(makeResponse({ activities, limit: 50, offset: 0 }));

    const { useUserActivity } = await import('./use-settings-queries');
    const { result } = renderHook(() => useUserActivity(undefined, 50), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callUrl = (fetchMock.mock.calls[0] as [string])[0];
    expect(callUrl).toContain('/api/settings/activity');
    expect(callUrl).toContain('limit=50');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/settings/activity'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.current.data).toEqual(activities);
  });

  it('surfaces error when server returns 401 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401));

    const { useUserActivity } = await import('./use-settings-queries');
    const { result } = renderHook(() => useUserActivity(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });
});

describe('useAuditLogActions · renderHook (GET /api/settings/audit-logs/actions)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/audit-logs/actions with auth header and returns actions', async () => {
    const actions = ['login', 'logout', 'settings_change', 'api_key_created'];
    fetchMock.mockResolvedValue(makeResponse({ actions }));

    const { useAuditLogActions } = await import('./use-settings-queries');
    const { result } = renderHook(() => useAuditLogActions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/audit-logs/actions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.current.data).toEqual(actions);
  });

  it('surfaces error when server returns 401 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401));

    const { useAuditLogActions } = await import('./use-settings-queries');
    const { result } = renderHook(() => useAuditLogActions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });
});

describe('useToggle2FA · enable must not falsely report success (A9)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('enable does NOT toast success even when enable2FA() resolves without error', async () => {
    const { toast } = await import('sonner');
    const { useToggle2FA } = await import('./use-settings-queries');
    const { result } = renderHook(() => useToggle2FA(), { wrapper: makeWrapper() });

    result.current.mutate(true);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('enable surfaces toast.error so the user knows verification is still required', async () => {
    const { toast } = await import('sonner');
    const { useToggle2FA } = await import('./use-settings-queries');
    const { result } = renderHook(() => useToggle2FA(), { wrapper: makeWrapper() });

    result.current.mutate(true);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('enable mutation ends in error state · 2FA is not actually turned on', async () => {
    const { useToggle2FA } = await import('./use-settings-queries');
    const { result } = renderHook(() => useToggle2FA(), { wrapper: makeWrapper() });

    result.current.mutate(true);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
