import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  assertAccountActive: vi.fn(),
  bankAccountsUnavailableReason: vi.fn(),
  readFinanceOverview: vi.fn(),
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
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/connectors/bank-accounts', () => ({
  bankAccountsToolDefs: vi.fn(),
  connectBankAccounts: vi.fn(),
  createBankAccountsLinkToken: vi.fn(),
  executeBankAccountsTool: vi.fn(),
  isBankAccountsTool: vi.fn(),
  readBankAccountOverview: vi.fn(),
  removeBankAccountsItem: vi.fn(),
  bankAccountsUnavailableReason: mocks.bankAccountsUnavailableReason,
}));
vi.mock('@/lib/services/finance-overview-service', () => ({
  financePeriodRange: vi.fn(),
  summarizeFinanceTransactions: vi.fn(),
  readFinanceOverview: mocks.readFinanceOverview,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

function request(search = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/finance/overview${search}`);
}

describe('/api/finance/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.assertAccountActive.mockResolvedValue(undefined);
    mocks.bankAccountsUnavailableReason.mockReturnValue(null);
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.readFinanceOverview).not.toHaveBeenCalled();
  });

  it('refuses a suspended account', async () => {
    mocks.assertAccountActive.mockRejectedValue(createError.forbidden('suspended'));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.readFinanceOverview).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'finance-overview',
      'user:user-1',
    );
    expect(mocks.readFinanceOverview).not.toHaveBeenCalled();
  });

  it('rejects an unknown period', async () => {
    const response = await GET(request('?period=7y'));
    expect(response.status).toBe(400);
    expect(mocks.readFinanceOverview).not.toHaveBeenCalled();
  });

  it('says finance is unavailable when bank accounts are not configured', async () => {
    mocks.bankAccountsUnavailableReason.mockReturnValue('Bank connections are not set up.');
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'unavailable',
      message: 'Bank connections are not set up.',
    });
    expect(mocks.readFinanceOverview).not.toHaveBeenCalled();
  });

  it('reads the caller overview for the requested period without caching', async () => {
    mocks.readFinanceOverview.mockResolvedValue({ status: 'empty' });
    const response = await GET(request('?period=90d'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ status: 'empty' });
    expect(mocks.readFinanceOverview).toHaveBeenCalledWith('user-1', '90d');
  });

  it('defaults to the 30 day period', async () => {
    mocks.readFinanceOverview.mockResolvedValue({ status: 'empty' });
    await GET(request());
    expect(mocks.readFinanceOverview).toHaveBeenCalledWith('user-1', '30d');
  });
});
