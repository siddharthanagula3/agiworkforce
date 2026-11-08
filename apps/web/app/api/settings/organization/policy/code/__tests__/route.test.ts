import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_WORKSPACE_CODE_CONTROLS } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/request-context-cache', () => ({
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));

const ORG = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  useRealPolicy: false,
  query: vi.fn(),
  permissions: new Set<string>(['policy.manage']),
  readPolicy: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  overrides: vi.fn(),
  hasOverrides: false,
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: ORG,
  })),
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ canManageTeam: true })),
}));
vi.mock('@/lib/services/organization-permission-service', () => ({
  resolveOrganizationPermissions: vi.fn(async () => mocks.permissions),
}));
vi.mock('@/lib/services/organization-policy-override-service', () => ({
  readApplicablePolicyOverrides: mocks.overrides,
}));
vi.mock('@/lib/services/organization-policy-service', async (importOriginal) => {
  const actual = await importOriginal<MockedModule0>();
  return {
    ...actual,
    readOrganizationPolicy: (...args: Parameters<typeof actual.readOrganizationPolicy>) =>
      mocks.useRealPolicy ? actual.readOrganizationPolicy(...args) : mocks.readPolicy(...args),
    readLayeredOrganizationPolicy: vi.fn(
      async (...args: Parameters<typeof actual.readLayeredOrganizationPolicy>) => {
        if (mocks.useRealPolicy) return actual.readLayeredOrganizationPolicy(...args);
        const policy = await mocks.readPolicy();
        return policy ? { policy, hasOverrides: mocks.hasOverrides } : null;
      },
    ),
    getEffectiveOrganizationPolicy: vi.fn(
      async (...args: Parameters<typeof actual.getEffectiveOrganizationPolicy>) => {
        if (mocks.useRealPolicy) return actual.getEffectiveOrganizationPolicy(...args);
        const policy = await mocks.readPolicy();
        return policy
          ? { organizationId: ORG, configured: true, policy }
          : {
              organizationId: ORG,
              configured: false,
              policy: actual.defaultAdminPolicyFor(ORG),
            };
      },
    ),
    upsertOrganizationPolicy: (...args: Parameters<typeof actual.upsertOrganizationPolicy>) =>
      mocks.useRealPolicy ? actual.upsertOrganizationPolicy(...args) : mocks.upsert(...args),
  };
});

const { GET, PATCH } = await import('../route');
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import {
  clearIpAllowListCacheForTests,
  getCachedIpAllowList,
  setCachedIpAllowList,
} from '@/lib/services/organization-ip-allow-list-cache';

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));

function policyRow(metadata: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    defaultPrivacyMode: 'managed',
    allowedPrivacyModes: ['local', 'byok', 'managed'],
    allowManagedCompute: true,
    requireLocalToByokPreview: false,
    chatSyncSurfaces: ['web', 'desktop', 'mobile'],
    allowCliCloudSync: true,
    allowVsCodeCloudSync: true,
    allowChromeCloudSync: true,
    auditExportEnabled: true,
    retentionDays: 365,
    retentionEnforced: false,
    externalSharingEnabled: true,
    allowMemory: true,
    secretHandling: 'warn',
    requireMfa: false,
    monthlySpendCapCents: null,
    zeroDataRetentionOnly: false,
    ipAllowList: [],
    controls: { featureAccess: { code: true } },
    metadata,
    revision: 4,
    updatedAt: '2026-09-17T00:00:00.000Z',
  };
}

function patchRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/policy/code', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useRealPolicy = false;
  mocks.overrides.mockResolvedValue([]);
  vi.mocked(getUserScopedDb).mockResolvedValue({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: ORG,
  } as never);
  vi.mocked(resolveOrganizationPermissions).mockImplementation(
    async () => mocks.permissions as never,
  );
  vi.mocked(requireTeamAdminAccess).mockResolvedValue({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
    seatsConsumed: null,
    seatsAvailable: null,
    seatSource: 'unknown',
  });
  mocks.query.mockImplementation(async (sql: string) => {
    if (/from public\.organization_members/i.test(sql)) {
      return [{ organization_id: ORG, role: 'admin' }];
    }
    throw new Error(`Unexpected legacy query: ${sql}`);
  });
  mocks.permissions = new Set(['policy.manage']);
  mocks.hasOverrides = false;
  mocks.readPolicy.mockResolvedValue(policyRow());
  mocks.upsert.mockImplementation(
    async (_db: unknown, _org: string, input: { metadata: Record<string, unknown> }) =>
      policyRow(input.metadata),
  );
});

describe('GET /api/settings/organization/policy/code', () => {
  it('answers with the defaults and the rule version for a workspace that set nothing', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/settings/organization/policy/code'),
    );
    const body = await response.json();

    expect(body.controls).toEqual(DEFAULT_WORKSPACE_CODE_CONTROLS);
    expect(body.effective.revision).toBe(4);
    expect(body.canManagePolicy).toBe(true);
  });

  it('returns the saved controls and the rules that narrowed them', async () => {
    mocks.readPolicy.mockResolvedValue(
      policyRow({ codeControls: { allowGithubConnection: false } }),
    );

    const body = await (
      await GET(new NextRequest('https://agiworkforce.com/api/settings/organization/policy/code'))
    ).json();

    expect(body.controls.allowGithubConnection).toBe(false);
    expect(body.effective.blockingRules).toContainEqual(
      expect.objectContaining({ codeControl: 'allowGithubConnection', scope: 'workspace' }),
    );
  });
});

describe('PATCH /api/settings/organization/policy/code', () => {
  it('saves a control and audits which connection was turned off', async () => {
    const response = await PATCH(patchRequest({ allowDesktopCloudSync: false }));
    expect(response.status).toBe(200);

    const [, , input] = mocks.upsert.mock.calls[0] as [
      unknown,
      string,
      { metadata: Record<string, unknown> },
    ];
    expect(input.metadata['codeControls']).toMatchObject({ allowDesktopCloudSync: false });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          changedKeys: ['allowDesktopCloudSync'],
          reason: 'off: allowDesktopCloudSync',
        }),
      }),
    );
  });

  it('leaves the workspace controls object untouched, so a Code save cannot widen a feature', async () => {
    await PATCH(patchRequest({ allowMcpServers: false }));

    const [, , input] = mocks.upsert.mock.calls[0] as [unknown, string, { controls: unknown }];
    expect(input.controls).toEqual({ featureAccess: { code: true } });
  });

  it('refuses a caller without policy.manage', async () => {
    mocks.permissions = new Set(['content.read']);

    expect((await PATCH(patchRequest({ allowMcpServers: false }))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('refuses an MCP allow list that nothing may reach', async () => {
    const response = await PATCH(
      patchRequest({ allowMcpServers: false, allowedMcpServers: ['mcp.example.com'] }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('refuses before a workspace policy exists, rather than writing the restrictive defaults', async () => {
    mocks.readPolicy.mockResolvedValue(null);

    expect((await PATCH(patchRequest({ allowMcpServers: false }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects a host that is not a hostname and an unknown control', async () => {
    expect(
      (await PATCH(patchRequest({ allowedEgressHosts: ['javascript:alert(1)'] }))).status,
    ).toBe(400);
    expect((await PATCH(patchRequest({ allowEverything: true }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

// UNRUN: auth and database effects are fixtures; this does not prove auth/RLS binding.
// Membership, policy mapping/merge, validation, and cache eviction use production code.
const CAPTURED_ORG = '22222222-2222-4222-8222-222222222222';
const CAPTURED_USER = 'captured-user';
const SAVED_ORG = ORG;

type ScopedRow = Record<string, unknown>;

function bindCapturedScope(
  options: {
    organizationId?: string | null;
    membership?: 'active' | 'absent' | 'mismatched';
    role?: 'owner' | 'admin' | 'member';
    entitled?: boolean;
    canManage?: boolean;
  } = {},
) {
  const rows = new Map<string, ScopedRow>([
    [
      SAVED_ORG,
      {
        organization_id: SAVED_ORG,
        default_privacy_mode: 'local',
        allowed_privacy_modes: ['local'],
        allow_managed_compute: false,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web'],
        allow_cli_cloud_sync: false,
        allow_vscode_cloud_sync: false,
        allow_chrome_cloud_sync: false,
        audit_export_enabled: true,
        retention_days: 11,
        retention_enforced: false,
        external_sharing_enabled: false,
        allow_memory: false,
        metadata: { marker: 'A', codeControls: { allowGithubConnection: false } },
        updated_at: '2026-11-01T00:00:00.000Z',
      },
    ],
    [
      CAPTURED_ORG,
      {
        organization_id: CAPTURED_ORG,
        default_privacy_mode: 'managed',
        allowed_privacy_modes: ['local', 'byok', 'managed'],
        allow_managed_compute: true,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web', 'desktop'],
        allow_cli_cloud_sync: true,
        allow_vscode_cloud_sync: true,
        allow_chrome_cloud_sync: true,
        audit_export_enabled: true,
        retention_days: 222,
        retention_enforced: false,
        external_sharing_enabled: true,
        allow_memory: true,
        metadata: { marker: 'B', codeControls: { allowGithubConnection: true } },
        updated_at: '2026-11-02T00:00:00.000Z',
      },
    ],
  ]);
  const revisions = new Map([
    [SAVED_ORG, 3],
    [CAPTURED_ORG, 9],
  ]);
  const originalA = JSON.stringify(rows.get(SAVED_ORG));
  const query = mocks.query;
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: SAVED_ORG }];
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      if (params[1] !== CAPTURED_USER) return [];
      if (params[0] === SAVED_ORG) return [{ organization_id: SAVED_ORG, role: 'owner' }];
      if (params[0] !== CAPTURED_ORG || options.membership === 'absent') return [];
      return [
        {
          organization_id: options.membership === 'mismatched' ? SAVED_ORG : CAPTURED_ORG,
          role: options.role ?? 'admin',
        },
      ];
    }
    const organizationId = String(params[0]);
    if (/insert into public\.organization_admin_policies/i.test(sql)) {
      const columns = [
        'organization_id',
        'default_privacy_mode',
        'allowed_privacy_modes',
        'allow_managed_compute',
        'require_local_to_byok_preview',
        'chat_sync_surfaces',
        'allow_cli_cloud_sync',
        'allow_vscode_cloud_sync',
        'allow_chrome_cloud_sync',
        'audit_export_enabled',
        'retention_days',
        'retention_enforced',
        'external_sharing_enabled',
        'allow_memory',
      ];
      const row = {
        ...rows.get(organizationId),
        ...Object.fromEntries(columns.map((column, index) => [column, params[index]])),
        metadata: JSON.parse(params[14] as string),
      };
      rows.set(organizationId, row);
      // Simulate the database revision trigger, not a production trigger test.
      revisions.set(organizationId, (revisions.get(organizationId) ?? 0) + 1);
      return [row];
    }
    if (/from public\.organization_admin_policies/i.test(sql)) {
      const row = rows.get(organizationId);
      return row ? [{ ...row, revision: revisions.get(organizationId), override_count: 1 }] : [];
    }
    if (/from public\.organization_policy_revisions/i.test(sql)) {
      return [{ revision: revisions.get(organizationId) }];
    }
    throw new Error(`Unexpected scoped fixture SQL: ${sql}`);
  });
  const db = { query };
  vi.mocked(getUserScopedDb).mockResolvedValue({
    db,
    userId: CAPTURED_USER,
    organizationId: options.organizationId === undefined ? CAPTURED_ORG : options.organizationId,
  } as never);
  vi.mocked(requireTeamAdminAccess).mockImplementation(async (scopedDb, userId, orgId) => {
    expect(scopedDb).toBe(db);
    expect(userId).toBe(CAPTURED_USER);
    if (orgId === CAPTURED_ORG && options.entitled === false) {
      throw createError.forbidden('Captured workspace has no eligible subscription');
    }
    return {
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unknown',
    };
  });
  vi.mocked(resolveOrganizationPermissions).mockImplementation(async (orgId, userId) => {
    expect(userId).toBe(CAPTURED_USER);
    return new Set(
      orgId === CAPTURED_ORG && options.canManage === false
        ? ['content.read']
        : ['content.read', 'policy.manage'],
    );
  });
  mocks.useRealPolicy = true;
  mocks.overrides.mockImplementation(async (...args: unknown[]) => {
    expect(args).toEqual([db, CAPTURED_ORG, CAPTURED_USER]);
    return [
      {
        id: 'B-user-override',
        organizationId: CAPTURED_ORG,
        subjectType: 'user',
        subjectId: CAPTURED_USER,
        layer: { code: { allowGithubConnection: false } },
        updatedAt: '2026-11-02T00:00:00.000Z',
      },
    ];
  });
  setCachedIpAllowList(SAVED_ORG, ['192.0.2.1']);
  setCachedIpAllowList(CAPTURED_ORG, ['198.51.100.1']);
  return {
    db,
    rows,
    revisions,
    assertAUnchanged() {
      expect(JSON.stringify(rows.get(SAVED_ORG))).toBe(originalA);
      expect(revisions.get(SAVED_ORG)).toBe(3);
      expect(getCachedIpAllowList(SAVED_ORG)).toEqual(['192.0.2.1']);
      expect(
        query.mock.calls.some(([sql]) => /from public\.user_settings/i.test(String(sql))),
      ).toBe(false);
      for (const [sql, params] of query.mock.calls) {
        if (/public\.organization_(members|admin_policies|policy_revisions)/i.test(String(sql))) {
          expect(params?.[0]).toBe(CAPTURED_ORG);
        }
      }
    },
    assertNoWrite() {
      expect(query.mock.calls.some(([sql]) => /insert into/i.test(String(sql)))).toBe(false);
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(getCachedIpAllowList(CAPTURED_ORG)).toEqual(['198.51.100.1']);
    },
  };
}

function scopedRequest(
  method: 'GET' | 'PATCH',
  explicit: boolean,
  body = { allowDesktopCloudSync: false },
  extraHeaders: Record<string, string> = {},
) {
  return new NextRequest('https://app.test/api/settings/organization/policy/code', {
    method,
    headers: {
      ...(explicit ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: CAPTURED_ORG } : {}),
      ...(method === 'PATCH' ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
  });
}

describe('captured policy scope (auth mocked; UNRUN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    vi.mocked(requireCsrfToken).mockResolvedValue(null);
    vi.mocked(withRateLimit).mockResolvedValue(null);
  });

  afterEach(() => {
    clearIpAllowListCacheForTests();
  });

  for (const explicit of [true, false]) {
    it(`reads captured B, never saved A (${explicit ? 'explicit selector' : 'headerless'})`, async () => {
      const state = bindCapturedScope({ role: 'member', canManage: false });
      const req = scopedRequest('GET', explicit);
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(CAPTURED_ORG);
      expect(body.configured).toBe(true);
      expect(body.canManagePolicy).toBe(false);
      expect(body.controls.allowGithubConnection).toBe(true);
      expect(body.effective.allowGithubConnection).toBe(false);
      expect(body.effective.appliedOverrideIds).toEqual(['B-user-override']);
      expect(body.effective.revision).toBe(9);
      expect(mocks.overrides).toHaveBeenCalledWith(state.db, CAPTURED_ORG, CAPTURED_USER);
      expect(response.headers.get('ETag')).toBeNull();
      expect(getUserScopedDb).toHaveBeenCalledWith(req, { mfaGateExemptForOwner: true });
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`writes only captured B (${explicit ? 'explicit selector' : 'headerless'})`, async () => {
      const state = bindCapturedScope();
      const req = scopedRequest(
        'PATCH',
        explicit,
        { allowDesktopCloudSync: false },
        { 'If-Match': 'not-a-revision-tag' },
      );
      const response = await PATCH(req);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(CAPTURED_ORG);
      expect(body.canManagePolicy).toBe(true);
      expect(getUserScopedDb).toHaveBeenCalledWith(req, { mfaGateExemptForOwner: true });
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
      expect(state.rows.get(CAPTURED_ORG)).toMatchObject({
        organization_id: CAPTURED_ORG,
        allow_managed_compute: true,
        metadata: { marker: 'B' },
      });
      expect(state.rows.get(CAPTURED_ORG)).toMatchObject({
        retention_days: 222,
        metadata: { codeControls: { allowDesktopCloudSync: false } },
      });
      expect(body.controls.allowDesktopCloudSync).toBe(false);
      expect(body.effective.appliedOverrideIds).toEqual(['B-user-override']);
      expect(body.effective.revision).toBe(10);
      expect(mocks.overrides).toHaveBeenCalledWith(state.db, CAPTURED_ORG, CAPTURED_USER);
      expect(response.headers.get('ETag')).toBeNull();
      expect(response.headers.get('x-workspace-revision')).toBeNull();
      expect(getCachedIpAllowList(CAPTURED_ORG)).toBeUndefined();
      expect(mocks.audit).toHaveBeenCalledTimes(1);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: CAPTURED_USER,
          organizationId: CAPTURED_ORG,
          eventType: 'admin_policy_changed',
          detail: expect.objectContaining({
            resourceId: CAPTURED_ORG,
            changedKeys: ['allowDesktopCloudSync'],
          }),
        }),
      );
      state.assertAUnchanged();
    });
  }

  for (const method of ['GET', 'PATCH'] as const) {
    for (const membership of ['absent', 'mismatched'] as const) {
      it(`refuses ${method} with ${membership} exact B membership`, async () => {
        const state = bindCapturedScope({ membership });
        expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
          403,
        );
        expect(requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(resolveOrganizationPermissions).not.toHaveBeenCalled();
        state.assertNoWrite();
        state.assertAUnchanged();
      });
    }

    it(`refuses ${method} for captured Personal without falling back to saved A`, async () => {
      const state = bindCapturedScope({ organizationId: null });
      const response = await (method === 'GET' ? GET : PATCH)(scopedRequest(method, false));
      expect(response.status).toBe(403);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(requireTeamAdminAccess).not.toHaveBeenCalled();
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`refuses ${method} for ineligible B even when A is eligible`, async () => {
      const state = bindCapturedScope({ entitled: false });
      expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
        403,
      );
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).not.toHaveBeenCalled();
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`preserves the ${method} rate-limit short circuit before auth`, async () => {
      const state = bindCapturedScope();
      vi.mocked(withRateLimit).mockResolvedValueOnce(new NextResponse(null, { status: 429 }));
      expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
        429,
      );
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      state.assertNoWrite();
    });
  }

  it('refuses a B write without policy.manage even when A permits management', async () => {
    const state = bindCapturedScope({ canManage: false });
    expect((await PATCH(scopedRequest('PATCH', true))).status).toBe(403);
    expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
    state.assertNoWrite();
    state.assertAUnchanged();
  });

  it('preserves the CSRF short circuit before rate limiting and auth', async () => {
    const state = bindCapturedScope();
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));
    expect((await PATCH(scopedRequest('PATCH', true))).status).toBe(403);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    state.assertNoWrite();
  });

  it('rejects invalid Code input without changing either workspace', async () => {
    const state = bindCapturedScope();
    const req = scopedRequest('PATCH', true);
    const invalid = new NextRequest(req.url, {
      method: 'PATCH',
      headers: req.headers,
      body: JSON.stringify({ allowEverything: true }),
    });
    expect((await PATCH(invalid)).status).toBe(400);
    state.assertNoWrite();
    state.assertAUnchanged();
  });
});

type MockedModule0 = typeof import('@/lib/services/organization-policy-service');
