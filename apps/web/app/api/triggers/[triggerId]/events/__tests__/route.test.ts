import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class TriggerNotFoundError extends Error {}
  class TriggerValidationError extends Error {}
  class TriggerLimitError extends Error {}
  return {
    TriggerNotFoundError,
    TriggerValidationError,
    TriggerLimitError,
    withRateLimit: vi.fn(),
    getUserScopedDb: vi.fn(),
    listTriggerDeliveries: vi.fn(),
  };
});

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/triggers/trigger-service', () => ({
  createTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  getTrigger: vi.fn(),
  listTriggers: vi.fn(),
  mapTrigger: vi.fn(),
  triggerListensTo: vi.fn(),
  updateTrigger: vi.fn(),
  validateTriggerInput: vi.fn(),
  TriggerNotFoundError: mocks.TriggerNotFoundError,
  TriggerValidationError: mocks.TriggerValidationError,
  TriggerLimitError: mocks.TriggerLimitError,
  listTriggerDeliveries: mocks.listTriggerDeliveries,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const TRIGGER_ID = '55555555-5555-4555-8555-555555555555';
const db = { query: vi.fn() };

function request(triggerId = TRIGGER_ID, query = ''): [NextRequest, never] {
  return [
    new NextRequest(`http://localhost/api/triggers/${triggerId}/events${query}`),
    { params: Promise.resolve({ triggerId }) } as never,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user_1' });
  mocks.listTriggerDeliveries.mockResolvedValue([]);
});

describe('GET /api/triggers/[triggerId]/events', () => {
  it('answers 401 when there is no session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(...request());

    expect(response.status).toBe(401);
    expect(mocks.listTriggerDeliveries).not.toHaveBeenCalled();
  });

  it('rejects a trigger id that is not a uuid', async () => {
    const response = await GET(...request('abc'));

    expect(response.status).toBe(400);
    expect(mocks.listTriggerDeliveries).not.toHaveBeenCalled();
  });

  it('answers 404 for a trigger the caller does not own', async () => {
    mocks.listTriggerDeliveries.mockRejectedValue(new mocks.TriggerNotFoundError());

    const response = await GET(...request());

    expect(response.status).toBe(404);
  });

  it('returns the rate limit response keyed on the user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(...request());

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'chat-conversation',
      'user:user_1',
    );
  });

  it('lists deliveries for the caller with clamped paging', async () => {
    const events = [{ id: 'evt_1', status: 'delivered' }];
    mocks.listTriggerDeliveries.mockResolvedValue(events);

    const response = await GET(...request(TRIGGER_ID, '?limit=500&offset=-3'));

    expect(response.status).toBe(200);
    expect(mocks.listTriggerDeliveries).toHaveBeenCalledWith(db, 'user_1', TRIGGER_ID, {
      limit: 100,
      offset: 0,
    });
    expect(await response.json()).toEqual({ events, pagination: { limit: 100, offset: 0 } });
  });

  it('falls back to the default page for a non-numeric limit', async () => {
    const response = await GET(...request(TRIGGER_ID, '?limit=ten&offset=20'));

    expect(response.status).toBe(200);
    expect((await response.json()).pagination).toEqual({ limit: 20, offset: 20 });
  });
});
