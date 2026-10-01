import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
type ScanModule0 = typeof import('@/lib/services/organization-permission-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  explainMemberAuthorization: vi.fn(),
  resolveAuthorizationFacts: vi.fn(),
  resolveOrganizationAccess: vi.fn(),
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.neonDb,
}));
vi.mock('@/lib/authorization', () => ({
  explainMemberAuthorization: mocks.explainMemberAuthorization,
  resolveAuthorizationFacts: mocks.resolveAuthorizationFacts,
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveOrganizationAccess: mocks.resolveOrganizationAccess,
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function get(query = '') {
  return GET(
    new NextRequest(`http://localhost/api/settings/organization/policy/effective/explain${query}`),
  );
}

describe('GET /api/settings/organization/policy/effective/explain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: ORG });
    mocks.explainMemberAuthorization.mockResolvedValue({ steps: ['role:member'] });
    mocks.resolveAuthorizationFacts.mockResolvedValue({ controls: { managedCompute: true } });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await get();

    expect(response.status).toBe(401);
  });

  it('answers ungoverned for a personal account', async () => {
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });

    const response = await get('?userId=someone-else');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizationId: null,
      governed: false,
      subjectUserId: 'user-1',
      explanation: null,
      controls: null,
    });
    expect(mocks.explainMemberAuthorization).not.toHaveBeenCalled();
  });

  it('explains the caller own access without a permission check', async () => {
    const response = await get('?projectId=%20proj-1%20&deviceId=');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      organizationId: ORG,
      governed: true,
      subjectUserId: 'user-1',
      explanation: { steps: ['role:member'] },
      controls: { managedCompute: true },
    });
    expect(mocks.resolveOrganizationAccess).not.toHaveBeenCalled();
    const scope = { organizationId: ORG, projectId: 'proj-1', deviceId: null };
    expect(mocks.explainMemberAuthorization).toHaveBeenCalledWith(
      mocks.neonDb,
      ORG,
      'user-1',
      scope,
    );
    expect(mocks.resolveAuthorizationFacts).toHaveBeenCalledWith(mocks.neonDb, 'user-1', scope);
  });

  it('refuses to explain another member without members.manage', async () => {
    mocks.resolveOrganizationAccess.mockResolvedValue({
      organizationId: ORG,
      role: 'member',
      permissions: new Set(),
    });

    const response = await get('?userId=user-2');

    expect(response.status).toBe(403);
    expect(mocks.resolveOrganizationAccess).toHaveBeenCalledWith(ORG, 'user-1');
    expect(mocks.explainMemberAuthorization).not.toHaveBeenCalled();
  });

  it('refuses a caller who is no longer a member', async () => {
    mocks.resolveOrganizationAccess.mockResolvedValue(null);

    const response = await get('?userId=user-2');

    expect(response.status).toBe(403);
    expect(mocks.explainMemberAuthorization).not.toHaveBeenCalled();
  });

  it('explains another member for an admin with members.manage', async () => {
    mocks.resolveOrganizationAccess.mockResolvedValue({
      organizationId: ORG,
      role: 'admin',
      permissions: new Set(['members.manage']),
    });

    const response = await get('?userId=user-2');

    expect(response.status).toBe(200);
    expect((await response.json()).subjectUserId).toBe('user-2');
    expect(mocks.explainMemberAuthorization).toHaveBeenCalledWith(
      mocks.neonDb,
      ORG,
      'user-2',
      expect.anything(),
    );
  });
});
