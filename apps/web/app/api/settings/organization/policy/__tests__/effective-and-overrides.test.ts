import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  effective: vi.fn(),
  permissions: new Set<string>(['content.read']),
  subjectExists: vi.fn(async () => true),
  upsert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: ORG })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveEffectiveWorkspaceControls: mocks.effective,
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ canManageTeam: true })),
}));
vi.mock('@/lib/services/organization-permission-service', async () => {
  const { createError } = await import('@/lib/errors');
  return {
    resolveOrganizationAccess: vi.fn(async (organizationId: string) => ({
      organizationId,
      role: 'member',
      permissions: mocks.permissions,
    })),
    requirePermission: (
      access: { permissions: Set<string> },
      permission: string,
      message: string,
    ) => {
      if (!access.permissions.has(permission)) throw createError.forbidden(message).asUserSafe();
      return access;
    },
  };
});
vi.mock('@/lib/services/organization-policy-override-service', () => ({
  listPolicyOverrides: vi.fn(async () => []),
  policySubjectExists: mocks.subjectExists,
  upsertPolicyOverride: mocks.upsert,
}));

const ORG = '11111111-1111-4111-8111-111111111111';

const { GET: getEffective } = await import('../effective/route');
const { PUT: putOverride } = await import('../overrides/route');

function effectiveRequest(etag?: string) {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/policy/effective', {
    headers: etag ? { 'if-none-match': etag } : {},
  });
}

function overrideRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/settings/organization/policy/overrides', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set(['content.read']);
  mocks.subjectExists.mockResolvedValue(true);
  mocks.effective.mockResolvedValue({
    organizationId: ORG,
    revision: 4,
    controls: {
      featureAccess: { code: false },
      defaultModelId: null,
      maxReasoningEffort: 'low',
      allowedCountries: [],
      allowedSurfaces: null,
      appliedOverrideIds: ['o-1'],
    },
  });
});

describe('GET /api/settings/organization/policy/effective', () => {
  it('returns the caller’s layered controls with the revision as an ETag', async () => {
    const response = await getEffective(effectiveRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${ORG}:4:o-1"`);
    expect(await response.json()).toMatchObject({ governed: true, revision: 4 });
  });

  it('answers 304 when the client already holds this revision', async () => {
    const response = await getEffective(effectiveRequest(`"${ORG}:4:o-1"`));
    expect(response.status).toBe(304);
  });

  it('answers a new body once the revision moves', async () => {
    mocks.effective.mockResolvedValueOnce({
      organizationId: ORG,
      revision: 5,
      controls: { appliedOverrideIds: [] },
    });
    const response = await getEffective(effectiveRequest(`"${ORG}:4:o-1"`));
    expect(response.status).toBe(200);
  });

  it('fails closed with a 503 when the policy cannot be read', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.effective.mockRejectedValueOnce(createError.serviceUnavailable('down').asUserSafe());
    const response = await getEffective(effectiveRequest());
    expect(response.status).toBe(503);
  });
});

describe('PUT /api/settings/organization/policy/overrides', () => {
  it('refuses a member without policy.manage', async () => {
    const response = await putOverride(
      overrideRequest({
        subjectType: 'user',
        subjectId: 'user-2',
        layer: { featureAccess: { code: true } },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('refuses an exception for someone outside the workspace', async () => {
    mocks.permissions = new Set(['content.read', 'policy.manage']);
    mocks.subjectExists.mockResolvedValueOnce(false);
    const response = await putOverride(
      overrideRequest({
        subjectType: 'user',
        subjectId: 'stranger',
        layer: { featureAccess: { code: true } },
      }),
    );
    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('writes only the controls the exception sets and records it in the audit trail', async () => {
    mocks.permissions = new Set(['content.read', 'policy.manage']);
    mocks.upsert.mockResolvedValueOnce({
      id: 'o-2',
      organizationId: ORG,
      subjectType: 'group',
      subjectId: 'g-1',
      layer: { featureAccess: { research: false } },
      updatedAt: '2026-09-17T00:00:00.000Z',
    });

    const response = await putOverride(
      overrideRequest({
        subjectType: 'group',
        subjectId: 'g-1',
        layer: { featureAccess: { research: false } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      subjectType: 'group',
      subjectId: 'g-1',
      layer: { featureAccess: { research: false } },
      actorUserId: 'user-1',
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_policy_changed' }),
    );
  });

  it('rejects an exception that sets nothing', async () => {
    mocks.permissions = new Set(['content.read', 'policy.manage']);
    const response = await putOverride(
      overrideRequest({ subjectType: 'user', subjectId: 'user-2', layer: {} }),
    );
    expect(response.status).toBe(400);
  });
});
