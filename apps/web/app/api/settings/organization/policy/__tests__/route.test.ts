import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockGetUserScopedDb,
  mockRecordAuditEvent,
  mockRequireTeamAdminAccess,
  mockResolveMfaEnrolled,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'team', canManageTeam: true })),
  mockResolveMfaEnrolled: vi.fn(async () => true),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security-audit')>();
  return { ...actual, recordAuditEvent: mockRecordAuditEvent };
});
vi.mock('@/lib/mfa-policy-gate', () => ({ resolveMfaEnrolled: mockResolveMfaEnrolled }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { GET, PATCH } from '../route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

const SAVED_POLICY = {
  organization_id: ORG_ID,
  default_privacy_mode: 'managed',
  allowed_privacy_modes: ['local', 'byok', 'managed'],
  allow_managed_compute: true,
  require_local_to_byok_preview: true,
  chat_sync_surfaces: ['web', 'desktop', 'mobile'],
  allow_cli_cloud_sync: false,
  allow_vscode_cloud_sync: false,
  allow_chrome_cloud_sync: false,
  audit_export_enabled: true,
  retention_days: 365,
  allow_memory: false,
  metadata: {},
  updated_at: '2026-08-22T00:00:00.000Z',
};

interface Fixture {
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  policyRow?: Record<string, unknown> | null;
  upsertResult?: Record<string, unknown>;
}

function bindCaller({ role = 'admin', policyRow = null, upsertResult }: Fixture = {}): void {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG_ID }];
    if (/from public\.organization_members/i.test(text)) {
      return [{ organization_id: ORG_ID, role }];
    }
    if (/insert into public\.organization_admin_policies/i.test(text)) {
      return [upsertResult ?? SAVED_POLICY];
    }
    if (/from public\.organization_admin_policies/i.test(text)) {
      return policyRow ? [policyRow] : [];
    }
    return [];
  });
}

function request(body?: unknown, extraHeaders: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/settings/organization/policy', {
    method: body ? 'PATCH' : 'GET',
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
        }
      : { headers: extraHeaders }),
  });
}

function upsertParams(): unknown[] {
  const call = mockQuery.mock.calls.find((entry) =>
    /insert into public\.organization_admin_policies/i.test(String(entry[0])),
  );
  return (call?.[1] ?? []) as unknown[];
}

describe('GET /api/settings/organization/policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-1',
    });
  });

  it('reports an unconfigured workspace as unconfigured rather than as governed defaults', async () => {
    bindCaller({ policyRow: null });

    const body = await (await GET(request() as never)).json();

    expect(body.configured).toBe(false);
    expect(body.organizationId).toBe(ORG_ID);
    expect(body.policy.allowManagedCompute).toBe(false);
  });

  it('returns the saved policy when one exists', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.configured).toBe(true);
    expect(body.policy.allowManagedCompute).toBe(true);
    expect(body.policy.allowedPrivacyModes).toEqual(['local', 'byok', 'managed']);
  });

  it('defaults secretHandling to redact when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.secretHandling).toBe('redact');
  });

  it('defaults zeroDataRetentionOnly to false when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.zeroDataRetentionOnly).toBe(false);
  });

  it('defaults ipAllowList to an empty array when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.ipAllowList).toEqual([]);
  });

  it('lets a member read the policy but not manage it', async () => {
    bindCaller({ role: 'member', policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.canManagePolicy).toBe(false);
    expect(body.currentUserRole).toBe('member');
  });

  it('passes the mfa gate owner exemption through to getUserScopedDb', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await GET(request() as never);

    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
    });
  });
});

describe('PATCH /api/settings/organization/policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-1',
    });
  });

  it('refuses a member', async () => {
    bindCaller({ role: 'member', policyRow: SAVED_POLICY });

    const response = await PATCH(request({ retentionDays: 30 }) as never);

    expect(response.status).toBe(403);
    expect(upsertParams()).toEqual([]);
  });

  it('merges a partial patch onto the SAVED policy, never onto the table defaults', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ retentionDays: 30 }) as never);

    const params = upsertParams();
    // allow_managed_compute is parameter 4 (1-indexed $4) and must survive a
    // patch that never mentioned it. Inheriting the column default here would
    // silently switch managed compute off for the whole workspace.
    expect(params[3]).toBe(true);
    expect(params[2]).toEqual(['local', 'byok', 'managed']);
    expect(params[10]).toBe(30);
  });

  it('rejects a default privacy mode that is not in the allowed set', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ defaultPrivacyMode: 'managed', allowedPrivacyModes: ['local'] }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects turning on managed compute while the managed privacy mode stays disallowed', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({
        allowManagedCompute: true,
        allowedPrivacyModes: ['local', 'byok'],
        defaultPrivacyMode: 'byok',
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects a body with no policy fields', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    expect((await PATCH(request({}) as never)).status).toBe(400);
  });

  it('rejects a retention window outside the schema bounds', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    expect((await PATCH(request({ retentionDays: 0 }) as never)).status).toBe(400);
    expect((await PATCH(request({ retentionDays: 4000 }) as never)).status).toBe(400);
  });

  it('writes an audit event naming the fields that changed', async () => {
    bindCaller({
      policyRow: SAVED_POLICY,
      upsertResult: { ...SAVED_POLICY, retention_days: 30 },
    });

    await PATCH(request({ retentionDays: 30 }) as never);

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as {
      eventType: string;
      organizationId: string;
      detail: { changedKeys: string[]; status: string };
    };
    expect(event.eventType).toBe('admin_policy_changed');
    expect(event.organizationId).toBe(ORG_ID);
    expect(event.detail.changedKeys).toEqual(['retentionDays']);
    expect(event.detail.status).toBe('updated');
  });

  it('marks the first save as a creation', async () => {
    bindCaller({ policyRow: null });

    await PATCH(request({ allowManagedCompute: false }) as never);

    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as { detail: { status: string } };
    expect(event.detail.status).toBe('created');
  });

  it('stores an allowMemory patch as its own column, not metadata', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ allowMemory: true }) as never);

    const params = upsertParams();
    expect(params[13]).toBe(true);
    expect(JSON.parse(params[14] as string)['allowMemory']).toBeUndefined();
  });

  it('stores a secretHandling patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ secretHandling: 'block' }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ secretHandling: 'block' });
  });

  it('rejects a secretHandling value outside warn, redact, block', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ secretHandling: 'ignore' }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('stores a requireMfa and monthlySpendCapCents patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ requireMfa: true, monthlySpendCapCents: 75_000 }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({
      requireMfa: true,
      monthlySpendCapCents: 75_000,
    });
  });

  it('clears a saved spend cap when the administrator patches it to null', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { monthlySpendCapCents: 50_000 } },
    });

    await PATCH(request({ monthlySpendCapCents: null }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ monthlySpendCapCents: null });
  });

  it('rejects a zero or negative spend cap', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ monthlySpendCapCents: 0 }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('stores a zeroDataRetentionOnly patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ zeroDataRetentionOnly: true }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ zeroDataRetentionOnly: true });
  });

  it('stores an ipAllowList patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(
      request(
        { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
        { 'x-forwarded-for': '203.0.113.5' },
      ) as never,
    );

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({
      ipAllowList: ['203.0.113.0/24', '2001:db8::/32'],
    });
  });

  it("rejects an ipAllowList that would exclude the requester's own connection", async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ ipAllowList: ['203.0.113.0/24'] }, { 'x-forwarded-for': '198.51.100.9' }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it("rejects an ipAllowList when the requester's ip cannot be determined", async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ ipAllowList: ['203.0.113.0/24'] }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects requireMfa=true when the requesting admin has no mfa enrolled', async () => {
    bindCaller({ policyRow: SAVED_POLICY });
    mockResolveMfaEnrolled.mockResolvedValueOnce(false);

    const response = await PATCH(request({ requireMfa: true }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('allows requireMfa=true when the requesting admin is mfa enrolled', async () => {
    bindCaller({ policyRow: SAVED_POLICY });
    mockResolveMfaEnrolled.mockResolvedValueOnce(true);

    const response = await PATCH(request({ requireMfa: true }) as never);

    expect(response.status).toBe(200);
  });

  it('passes the mfa gate owner exemption through to getUserScopedDb', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ retentionDays: 45 }) as never);

    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
    });
  });

  it('rejects an ipAllowList entry that is not a valid address or CIDR', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ ipAllowList: ['not-an-address'] }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('clears a saved ip allow list when the administrator patches it to empty', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { ipAllowList: ['203.0.113.0/24'] } },
    });

    await PATCH(request({ ipAllowList: [] }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ ipAllowList: [] });
  });

  it('records the before and after ip allow list ranges on the audit event', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { ipAllowList: ['203.0.113.0/24'] } },
      upsertResult: {
        ...SAVED_POLICY,
        metadata: { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
      },
    });

    await PATCH(
      request(
        { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
        { 'x-forwarded-for': '203.0.113.5' },
      ) as never,
    );

    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as {
      detail: { ipAllowListChange?: { from: unknown; to: unknown } };
    };
    expect(event.detail.ipAllowListChange).toEqual({
      from: ['203.0.113.0/24'],
      to: ['203.0.113.0/24', '2001:db8::/32'],
    });
  });

  it('deduplicates repeated modes and surfaces before writing', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(
      request({
        allowedPrivacyModes: ['local', 'local', 'byok'],
        defaultPrivacyMode: 'byok',
        allowManagedCompute: false,
        chatSyncSurfaces: ['web', 'web'],
      }) as never,
    );

    const params = upsertParams();
    expect(params[2]).toEqual(['local', 'byok']);
    expect(params[5]).toEqual(['web']);
  });
});
