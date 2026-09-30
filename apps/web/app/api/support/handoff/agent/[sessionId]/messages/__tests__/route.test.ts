import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  getSessionById: vi.fn(),
  appendHandoffMessage: vi.fn(),
  listHandoffMessages: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
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
vi.mock('@/lib/auth-guards', () => ({
  requireAdmin: vi.fn(),
  requireRole: vi.fn(),
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', () => ({
  cancelSessionForOwner: vi.fn(),
  claimExpiredWaitingBatch: vi.fn(),
  claimExpiredWaitingSession: vi.fn(),
  claimSessionForAgent: vi.fn(),
  closeIdleConnectedSessions: vi.fn(),
  getSessionForOwner: vi.fn(),
  insertHandoffSession: vi.fn(),
  listFreshOnlineAgents: vi.fn(),
  listWaitingQueue: vi.fn(),
  purgeOldHandoffSessions: vi.fn(),
  recordEmailOutcome: vi.fn(),
  upsertAgentPresence: vi.fn(),
  getSessionById: mocks.getSessionById,
  appendHandoffMessage: mocks.appendHandoffMessage,
  listHandoffMessages: mocks.listHandoffMessages,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const SESSION_ID = 'session-1';
const OPERATOR = 'operator_1';
const URL_BASE = `http://localhost/api/support/handoff/agent/${SESSION_ID}/messages`;
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function postRequest(body: unknown): NextRequest {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: OPERATOR });
  mocks.getSessionById.mockResolvedValue({
    id: SESSION_ID,
    status: 'connected',
    agent_user_id: OPERATOR,
  });
  mocks.listHandoffMessages.mockResolvedValue([]);
});

describe('GET /api/support/handoff/agent/[sessionId]/messages', () => {
  it('refuses a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(new NextRequest(URL_BASE), context);

    expect(response.status).toBe(404);
    expect(mocks.getSessionById).not.toHaveBeenCalled();
  });

  it('hides a session claimed by another operator', async () => {
    mocks.getSessionById.mockResolvedValue({
      id: SESSION_ID,
      status: 'connected',
      agent_user_id: 'operator_2',
    });

    const response = await GET(new NextRequest(URL_BASE), context);

    expect(response.status).toBe(404);
    expect(mocks.listHandoffMessages).not.toHaveBeenCalled();
  });

  it('lists the transcript after the cursor for the claiming operator', async () => {
    mocks.listHandoffMessages.mockResolvedValue([
      { seq: '3', author: 'user', body: 'Help', created_at: '2026-09-28T00:00:00.000Z' },
    ]);

    const response = await GET(new NextRequest(`${URL_BASE}?after=2`), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.listHandoffMessages).toHaveBeenCalledWith(SESSION_ID, 2, 100);
    expect(body).toMatchObject({
      sessionId: SESSION_ID,
      status: 'connected',
      nextAfter: 3,
      messages: [{ seq: 3, author: 'user', body: 'Help', at: '2026-09-28T00:00:00.000Z' }],
    });
  });
});

describe('POST /api/support/handoff/agent/[sessionId]/messages', () => {
  it('stops at the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(403);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(404);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('refuses to post into a session claimed by another operator', async () => {
    mocks.getSessionById.mockResolvedValue({
      id: SESSION_ID,
      status: 'connected',
      agent_user_id: 'operator_2',
    });

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(404);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('answers 409 for a closed session', async () => {
    mocks.getSessionById.mockResolvedValue({
      id: SESSION_ID,
      status: 'closed',
      agent_user_id: OPERATOR,
    });

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(409);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('rejects an invalid body with 400', async () => {
    const response = await POST(postRequest({ text: 'hi' }), context);

    expect(response.status).toBe(400);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('appends the agent message and returns it', async () => {
    mocks.appendHandoffMessage.mockResolvedValue({
      seq: 5,
      author: 'agent',
      body: 'Looking now',
      created_at: '2026-09-28T00:00:03.000Z',
    });

    const response = await POST(postRequest({ body: 'Looking now' }), context);

    expect(response.status).toBe(200);
    expect(mocks.appendHandoffMessage).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      author: 'agent',
      body: 'Looking now',
    });
    expect(await response.json()).toEqual({
      message: { seq: 5, author: 'agent', body: 'Looking now', at: '2026-09-28T00:00:03.000Z' },
    });
  });
});
