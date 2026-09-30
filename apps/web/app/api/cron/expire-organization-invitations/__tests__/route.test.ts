import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  expirePendingInvitations: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  getClientIpForRateLimit: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/services/organization-invitation-service', () => ({
  INVITATION_TERMINAL_STATUSES: vi.fn(),
  INVITATION_TTL_MS: vi.fn(),
  MAX_INVITATION_RESENDS: 10,
  acceptInvitation: vi.fn(),
  createInvitation: vi.fn(),
  createInvitationCredential: vi.fn(),
  declineInvitation: vi.fn(),
  formatInvitation: vi.fn(),
  hashInvitationToken: vi.fn(),
  listInvitationPage: vi.fn(),
  listInvitations: vi.fn(),
  normalizeInvitationEmail: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  expirePendingInvitations: mocks.expirePendingInvitations,
}));

import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';
import { GET } from '../route';

const SECRET = 'cron-secret-with-at-least-thirty-two-chars';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/expire-organization-invitations', {
    headers: authorization ? { authorization } : {},
  });
}

describe('/api/cron/expire-organization-invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCronAuthThrottleForTests();
    vi.stubEnv('CRON_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a request without the cron secret', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.expirePendingInvitations).not.toHaveBeenCalled();
  });

  it('refuses a request with the wrong cron secret', async () => {
    const response = await GET(request('Bearer not-the-secret'));
    expect(response.status).toBe(401);
    expect(mocks.expirePendingInvitations).not.toHaveBeenCalled();
  });

  it('expires lapsed invitations when the secret matches', async () => {
    mocks.expirePendingInvitations.mockResolvedValue(3);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 3 });
    expect(mocks.expirePendingInvitations).toHaveBeenCalledWith(mocks.db);
  });

  it('reports nothing to expire when the invitations table is missing', async () => {
    mocks.expirePendingInvitations.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Organization invitations are not provisioned',
      expired: 0,
    });
  });

  it('answers 500 without leaking the failure', async () => {
    mocks.expirePendingInvitations.mockRejectedValue(new Error('connection reset by db-host-9'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
