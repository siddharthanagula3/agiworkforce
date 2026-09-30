import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  loadSlackOverview: vi.fn(),
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
vi.mock('@/lib/slack/slack-settings', () => ({
  PERSONAL_WORKSPACE_NAME: 'Personal',
  listSlackLinkWorkspaces: vi.fn(),
  slackPlanAllowed: vi.fn(),
  slackRequiredPlans: vi.fn(),
  loadSlackOverview: mocks.loadSlackOverview,
}));

import { createError } from '@/lib/errors';

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest('http://localhost/api/slack');
}

const overview = {
  available: true,
  planAllowed: true,
  requiredPlans: 'Pro, Max',
  installations: [
    { id: 'inst-1', teamId: 'T1', teamName: 'Acme', installedAt: '2026-09-01T00:00:00.000Z' },
  ],
  links: [],
  approvals: [],
};

describe('GET /api/slack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: ORG });
    mocks.loadSlackOverview.mockResolvedValue(overview);
  });

  it('returns 401 without a session and loads nothing', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.loadSlackOverview).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before loading', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'slack-settings',
      'user:user-1',
    );
    expect(mocks.loadSlackOverview).not.toHaveBeenCalled();
  });

  it('loads the overview for the caller and active workspace', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(overview);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: true,
    });
    expect(mocks.loadSlackOverview).toHaveBeenCalledWith(db, 'user-1', ORG);
  });
});
