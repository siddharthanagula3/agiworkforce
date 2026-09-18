import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_WORKSPACE_CODE_CONTROLS } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const ORG = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(['policy.manage']),
  readPolicy: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  overrides: vi.fn(async () => []),
  hasOverrides: false,
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: ORG })),
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ canManageTeam: true })),
}));
vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveOrgMembership: vi.fn(async () => ({ organizationId: ORG, role: 'admin' })),
  requireOrgMember: (membership: unknown) => membership,
}));
vi.mock('@/lib/services/organization-permission-service', () => ({
  resolveOrganizationPermissions: vi.fn(async () => mocks.permissions),
}));
vi.mock('@/lib/services/organization-policy-override-service', () => ({
  readApplicablePolicyOverrides: mocks.overrides,
}));
vi.mock('@/lib/services/organization-policy-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    readOrganizationPolicy: mocks.readPolicy,
    readLayeredOrganizationPolicy: vi.fn(async () => {
      const policy = await mocks.readPolicy();
      return policy ? { policy, hasOverrides: mocks.hasOverrides } : null;
    }),
    getEffectiveOrganizationPolicy: vi.fn(async () => {
      const policy = await mocks.readPolicy();
      return policy
        ? { organizationId: ORG, configured: true, policy }
        : {
            organizationId: ORG,
            configured: false,
            policy: (actual['defaultAdminPolicyFor'] as (id: string) => unknown)(ORG),
          };
    }),
    upsertOrganizationPolicy: mocks.upsert,
  };
});

const { GET, PATCH } = await import('../route');

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
