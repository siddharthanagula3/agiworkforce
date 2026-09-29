import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  loadMcpAppPayload: vi.fn(),
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
vi.mock('@/lib/connectors/mcp-state-store', () => ({
  bindMcpTask: vi.fn(),
  isMcpTaskBound: vi.fn(),
  saveMcpAppPayload: vi.fn(),
  loadMcpAppPayload: mocks.loadMcpAppPayload,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const PAYLOAD = '88888888-8888-4888-8888-888888888888';

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/mcp-apps/payload/${PAYLOAD}`);
}

function context(payloadId = PAYLOAD) {
  return { params: Promise.resolve({ payloadId }) };
}

describe('/api/mcp-apps/payload/[payloadId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request(), context());
    expect(response.status).toBe(429);
    expect(mocks.loadMcpAppPayload).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await GET(request(), context('payload-1'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.loadMcpAppPayload).not.toHaveBeenCalled();
  });

  it('answers 404 for a payload the caller does not own or that expired', async () => {
    mocks.loadMcpAppPayload.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
  });

  it('returns the caller payload without caching', async () => {
    const payload = {
      id: PAYLOAD,
      connectorId: 'figma',
      resourceUri: 'ui://figma/card',
      toolName: 'render',
      toolInput: { a: 1 },
      toolResult: { ok: true },
    };
    mocks.loadMcpAppPayload.mockResolvedValue(payload);
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(payload);
    expect(mocks.loadMcpAppPayload).toHaveBeenCalledWith('user-1', PAYLOAD);
  });
});
