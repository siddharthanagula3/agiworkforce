import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  policyScopeSubjectExists: vi.fn(),
  diagnoseMemberPolicy: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.neonDb,
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: vi.fn(),
  readOrganizationIpAllowList: vi.fn(),
  resolveEffectiveWorkspaceControls: vi.fn(),
  resolveIpAllowListPolicy: vi.fn(),
  resolveMfaPolicy: vi.fn(),
  resolveSecretHandlingPolicy: vi.fn(),
  resolveZeroDataRetentionPolicy: vi.fn(),
  diagnoseMemberPolicy: mocks.diagnoseMemberPolicy,
}));
vi.mock('@/app/api/settings/organization/policy/policy-subject', () => ({
  policyScopeSubjectExists: mocks.policyScopeSubjectExists,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  resolveWorkspaceConsoleAccess: vi.fn(),
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/settings/organization/policy/diagnose${query}`));
}

describe('GET /api/settings/organization/policy/diagnose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue({
      userId: 'admin-1',
      organizationId: ORG,
    });
    mocks.policyScopeSubjectExists.mockResolvedValue(true);
    mocks.diagnoseMemberPolicy.mockResolvedValue({ allowed: true, layers: [] });
  });

  it('requires policy.manage', async () => {
    mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

    const response = await get('?memberId=user-2');

    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
      expect.anything(),
      'policy.manage',
      expect.any(String),
    );
    expect(mocks.diagnoseMemberPolicy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing member', ''],
    ['an unknown feature', '?memberId=user-2&feature=teleport'],
    ['an unknown surface', '?memberId=user-2&surface=fax'],
    ['a malformed country', '?memberId=user-2&country=USA'],
    ['an unknown parameter', '?memberId=user-2&extra=1'],
  ])('rejects %s with 400', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(mocks.diagnoseMemberPolicy).not.toHaveBeenCalled();
  });

  it('returns 404 for someone outside the workspace', async () => {
    mocks.policyScopeSubjectExists.mockResolvedValue(false);

    const response = await get('?memberId=stranger');

    expect(response.status).toBe(404);
    expect(mocks.policyScopeSubjectExists).toHaveBeenCalledWith(
      mocks.neonDb,
      ORG,
      'user',
      'stranger',
    );
    expect(mocks.diagnoseMemberPolicy).not.toHaveBeenCalled();
  });

  it('diagnoses a feature ask with web and upper-cased country defaults', async () => {
    const response = await get('?memberId=user-2&feature=code&country=de&surface=');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      organizationId: ORG,
      memberId: 'user-2',
      allowed: true,
      layers: [],
    });
    expect(mocks.diagnoseMemberPolicy).toHaveBeenCalledWith(mocks.neonDb, ORG, 'user-2', {
      resource: 'feature',
      feature: 'code',
      surface: 'web',
      country: 'DE',
    });
  });

  it('diagnoses managed compute when only a surface is given', async () => {
    await get('?memberId=user-2&surface=desktop');

    expect(mocks.diagnoseMemberPolicy).toHaveBeenCalledWith(mocks.neonDb, ORG, 'user-2', {
      resource: 'managed_compute',
      surface: 'desktop',
      country: null,
    });
  });

  it('diagnoses the member with no ask when neither is given', async () => {
    await get('?memberId=user-2');

    expect(mocks.diagnoseMemberPolicy).toHaveBeenCalledWith(mocks.neonDb, ORG, 'user-2', null);
  });
});
