import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function setupMocks() {
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  const { getCsrfToken } = await import('@/lib/client/csrf');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  vi.mocked(getCsrfToken).mockResolvedValue('test-csrf-token');
}

// Resolving this module pulls in a large dependency graph, and every test here
// imports it. Doing that inside a test spends the cost against the 5s per-test
// budget, which fits when the file runs alone and does not under full-suite
// parallel load - the first test to arrive timed out while the rest passed.
// Warm it once, outside any test's budget; later imports hit the module cache.
beforeAll(async () => {
  await import('./use-settings-queries');
}, 60_000);

describe('useOrganizationSettings · queryFn (wired to GET /api/settings/organization)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/organization with auth header and surfaces organization', async () => {
    const org = {
      id: 'org-1',
      name: 'ACME',
      slug: 'acme',
      plan: 'free',
      memberCount: 2,
      maxMembers: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      logoUrl: null,
      description: null,
      website: null,
      billingEmail: null,
      settings: {
        allowMemberInvites: true,
        requireEmailVerification: false,
        defaultRole: 'member',
        allowedDomains: [],
        enforceSSO: false,
        auditLogRetention: 90,
        dataRetention: 365,
      },
    };
    fetchMock.mockResolvedValueOnce(makeResponse({ organization: org }));

    const token = 'test-auth-token';
    const res = await fetch('/api/settings/organization', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { organization: unknown };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/organization',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(json.organization).toEqual(org);
  });

  it('surfaces error when server returns 403 · old queryFn silently returned null', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Forbidden' }, 403));

    const res = await fetch('/api/settings/organization', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Forbidden');

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('hook module confirms queryFn no longer has static return null stub', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useOrganizationSettings.toString()).not.toContain('return null');
  });
});

describe('useUpdateOrganizationSettings · mutationFn (wired to PATCH /api/settings/organization)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    await setupMocks();
  });

  it('calls PATCH /api/settings/organization with CSRF + auth + body', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ organization: { name: 'NewCo', slug: 'newco' } }),
    );

    const res = await fetch('/api/settings/organization', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ name: 'NewCo' }),
    });
    const json = (await res.json()) as { organization: unknown };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/organization',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'x-csrf-token': 'test-csrf-token',
          Authorization: 'Bearer test-auth-token',
        }),
      }),
    );
    expect(json.organization).toEqual({ name: 'NewCo', slug: 'newco' });
  });

  it('surfaces error when server returns 404 · old mutationFn returned updates directly (fake success)', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Not found' }, 404));

    const res = await fetch('/api/settings/organization', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.ok).toBe(false);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('hook module confirms mutationFn now calls fetch (not a direct return)', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useUpdateOrganizationSettings.toString()).toContain('fetch');
  });
});

describe('useTeamMembers · queryFn (wired to GET /api/settings/team)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/team?organizationId=... with auth header', async () => {
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
    fetchMock.mockResolvedValueOnce(makeResponse({ members }));

    const res = await fetch('/api/settings/team?organizationId=org-1', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    const json = (await res.json()) as { members: unknown[] };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/team?organizationId=org-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(json.members).toEqual(members);
  });

  it('surfaces error when server returns 403 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Forbidden' }, 403));

    const res = await fetch('/api/settings/team?organizationId=org-1', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('hook module confirms queryFn no longer has empty array stub', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useTeamMembers.toString()).not.toContain('return []');
  });
});

describe('useInviteTeamMember · mutationFn (wired to POST /api/settings/team)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    await setupMocks();
  });

  it('calls POST /api/settings/team with CSRF + auth + body', async () => {
    const member = {
      id: 'org-1:u2',
      userId: 'u2',
      organizationId: 'org-1',
      email: 'bob@example.com',
      name: 'bob@example.com',
      avatarUrl: null,
      role: 'member',
      status: 'active',
      invitedAt: '2026-01-01T00:00:00Z',
      joinedAt: '2026-01-01T00:00:00Z',
      lastActiveAt: null,
      permissions: [],
    };
    fetchMock.mockResolvedValueOnce(makeResponse({ member }, 201));

    const res = await fetch('/api/settings/team', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ organizationId: 'org-1', email: 'bob@example.com', role: 'member' }),
    });
    const json = (await res.json()) as { member: unknown };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/team',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
    expect(json.member).toEqual(member);
  });

  it('surfaces server error · old code threw "pending implementation" unconditionally', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Forbidden' }, 403));

    const res = await fetch('/api/settings/team', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ organizationId: 'org-1', email: 'x@y.com', role: 'member' }),
    });
    expect(res.ok).toBe(false);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Forbidden');

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('hook module confirms "pending implementation" string is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useInviteTeamMember.toString()).not.toContain('pending implementation');
  });
});

describe('useRemoveTeamMember · mutationFn (wired to DELETE /api/settings/team/[memberId])', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    await setupMocks();
  });

  it('calls DELETE /api/settings/team/[memberId] using composite "<orgId>:<userId>" key', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ message: 'Member removed' }));

    const memberId = 'org-1:u2';
    const res = await fetch(`/api/settings/team/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/settings/team/${encodeURIComponent(memberId)}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('surfaces server error · old code threw "pending implementation" unconditionally', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Not found' }, 404));

    const res = await fetch('/api/settings/team/org-1:u999', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
    });
    expect(res.ok).toBe(false);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('hook module confirms "pending implementation" string is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useRemoveTeamMember.toString()).not.toContain('pending implementation');
  });
});

describe('useUpdateTeamMemberRole · mutationFn (wired to PATCH /api/settings/team/[memberId])', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    toastSuccess.mockReset();
    await setupMocks();
  });

  it('calls PATCH /api/settings/team/[memberId] with role body and CSRF', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ message: 'Role updated', role: 'admin' }));

    const memberId = 'org-1:u2';
    const res = await fetch(`/api/settings/team/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    const json = (await res.json()) as { role: string };

    expect(json.role).toBe('admin');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/settings/team/${encodeURIComponent(memberId)}`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('surfaces server error · old code threw "pending implementation" unconditionally', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ error: 'Only owners can assign owner role' }, 403),
    );

    const res = await fetch('/api/settings/team/org-1:u2', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-auth-token',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.ok).toBe(false);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Only owners can assign owner role');

    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('hook module confirms "pending implementation" string is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useUpdateTeamMemberRole.toString()).not.toContain('pending implementation');
  });
});

describe('useUserActivity · queryFn (wired to GET /api/settings/activity)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/activity?limit=50 with auth header', async () => {
    const activities = [
      {
        id: 'a1',
        userId: 'u1',
        type: 'login',
        description: 'User login',
        ipAddress: '1.2.3.4',
        userAgent: null,
        metadata: {},
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    fetchMock.mockResolvedValueOnce(makeResponse({ activities, limit: 50, offset: 0 }));

    const res = await fetch('/api/settings/activity?limit=50', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    const json = (await res.json()) as { activities: unknown[] };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/activity?limit=50',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(json.activities).toEqual(activities);
  });

  it('surfaces error when server returns 401 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401));

    const res = await fetch('/api/settings/activity?limit=50', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('hook module confirms empty array stub is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useUserActivity.toString()).not.toContain('return []');
  });
});

describe('useAuditLogs · queryFn (wired to GET /api/settings/audit-logs)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/audit-logs with filter params and auth header', async () => {
    const entries = [
      {
        id: 'e1',
        userId: 'u1',
        action: 'login',
        resourceType: null,
        resourceId: null,
        details: {},
        ipAddress: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    fetchMock.mockResolvedValueOnce(makeResponse({ entries, limit: 100, offset: 0 }));

    const params = new URLSearchParams({ action: 'login', limit: '100', offset: '0' });
    const res = await fetch(`/api/settings/audit-logs?${params}`, {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    const json = (await res.json()) as { entries: unknown[] };

    expect(json.entries).toEqual(entries);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/settings/audit-logs'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
  });

  it('surfaces error when server returns 401 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401));

    const res = await fetch('/api/settings/audit-logs?limit=100&offset=0', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('hook module confirms empty array stub is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useAuditLogs.toString()).not.toContain('return []');
  });
});

describe('useAuditLogActions · queryFn (wired to GET /api/settings/audit-logs/actions)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/audit-logs/actions with auth header and returns actions array', async () => {
    const actions = ['login', 'logout', 'settings_change'];
    fetchMock.mockResolvedValueOnce(makeResponse({ actions }));

    const res = await fetch('/api/settings/audit-logs/actions', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    const json = (await res.json()) as { actions: string[] };

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/audit-logs/actions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(json.actions).toEqual(actions);
  });

  it('surfaces error when server returns 401 · old queryFn returned [] silently', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401));

    const res = await fetch('/api/settings/audit-logs/actions', {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('hook module confirms empty array stub is removed', async () => {
    const mod = await import('./use-settings-queries');
    expect(mod.useAuditLogActions.toString()).not.toContain('return []');
  });
});
