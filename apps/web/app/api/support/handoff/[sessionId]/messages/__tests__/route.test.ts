import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  resolveHandoffIdentity: vi.fn(),
  getSessionForOwner: vi.fn(),
  appendHandoffMessage: vi.fn(),
  listHandoffMessages: vi.fn(),
  requireHumanCaller: vi.fn(),
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
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/request-identity', () => ({
  resolveHandoffIdentity: mocks.resolveHandoffIdentity,
}));
vi.mock('@/lib/support/handoff/store', () => ({
  cancelSessionForOwner: vi.fn(),
  claimExpiredWaitingBatch: vi.fn(),
  claimExpiredWaitingSession: vi.fn(),
  claimSessionForAgent: vi.fn(),
  closeIdleConnectedSessions: vi.fn(),
  getSessionById: vi.fn(),
  insertHandoffSession: vi.fn(),
  listFreshOnlineAgents: vi.fn(),
  listWaitingQueue: vi.fn(),
  purgeOldHandoffSessions: vi.fn(),
  recordEmailOutcome: vi.fn(),
  upsertAgentPresence: vi.fn(),
  getSessionForOwner: mocks.getSessionForOwner,
  appendHandoffMessage: mocks.appendHandoffMessage,
  listHandoffMessages: mocks.listHandoffMessages,
}));
vi.mock('@/lib/security/bot-challenge', () => ({
  isBotChallengeEnforced: vi.fn(),
  isPlatformBotProtectionAvailable: vi.fn(),
  verifyBotChallenge: vi.fn(),
  requireHumanCaller: mocks.requireHumanCaller,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const SESSION_ID = 'session-1';
const URL_BASE = `http://localhost/api/support/handoff/${SESSION_ID}/messages`;
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function getRequest(query = ''): NextRequest {
  return new NextRequest(`${URL_BASE}${query}`);
}

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
  mocks.requireHumanCaller.mockResolvedValue(undefined);
  mocks.resolveHandoffIdentity.mockResolvedValue({ userId: 'user_1', ownerSessionKey: 'owner-1' });
  mocks.getSessionForOwner.mockResolvedValue({ id: SESSION_ID, status: 'connected' });
  mocks.listHandoffMessages.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/support/handoff/[sessionId]/messages', () => {
  it('answers 404 when the caller does not own the session', async () => {
    mocks.getSessionForOwner.mockResolvedValue(null);

    const response = await GET(getRequest(), context);

    expect(response.status).toBe(404);
    expect(mocks.getSessionForOwner).toHaveBeenCalledWith(SESSION_ID, 'owner-1');
    expect(mocks.listHandoffMessages).not.toHaveBeenCalled();
  });

  it('returns the page after the cursor for the owner', async () => {
    mocks.listHandoffMessages.mockResolvedValue([
      { seq: '7', author: 'agent', body: 'Hi', created_at: '2026-09-28T00:00:00.000Z' },
      { seq: '8', author: 'user', body: 'Hello', created_at: '2026-09-28T00:00:01.000Z' },
    ]);

    const response = await GET(getRequest('?after=6'), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.listHandoffMessages).toHaveBeenCalledWith(SESSION_ID, 6, 100);
    expect(body).toMatchObject({
      sessionId: SESSION_ID,
      status: 'connected',
      nextAfter: 8,
      messages: [
        { seq: 7, author: 'agent', body: 'Hi', at: '2026-09-28T00:00:00.000Z' },
        { seq: 8, author: 'user', body: 'Hello', at: '2026-09-28T00:00:01.000Z' },
      ],
    });
    expect(body.pollIntervalMs).toBeGreaterThan(0);
  });

  it('treats a junk cursor as zero', async () => {
    const response = await GET(getRequest('?after=-4'), context);

    expect(response.status).toBe(200);
    expect(mocks.listHandoffMessages).toHaveBeenCalledWith(SESSION_ID, 0, 100);
    expect((await response.json()).nextAfter).toBe(0);
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(getRequest(), context);

    expect(response.status).toBe(429);
    expect(mocks.resolveHandoffIdentity).not.toHaveBeenCalled();
  });
});

describe('POST /api/support/handoff/[sessionId]/messages', () => {
  it('stops at the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(403);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('refuses a caller that fails the bot challenge', async () => {
    mocks.requireHumanCaller.mockRejectedValue(createError.forbidden('Challenge required'));

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(403);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('answers 404 for a session the caller does not own', async () => {
    mocks.getSessionForOwner.mockResolvedValue(null);

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(404);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('answers 409 when no person is connected', async () => {
    mocks.getSessionForOwner.mockResolvedValue({ id: SESSION_ID, status: 'waiting' });

    const response = await POST(postRequest({ body: 'hi' }), context);

    expect(response.status).toBe(409);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('rejects an empty message with 400', async () => {
    const response = await POST(postRequest({ body: '   ' }), context);

    expect(response.status).toBe(400);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('appends the user message and returns it', async () => {
    mocks.appendHandoffMessage.mockResolvedValue({
      seq: 9,
      author: 'user',
      body: 'My invoice is wrong',
      created_at: '2026-09-28T00:00:02.000Z',
    });

    const response = await POST(postRequest({ body: 'My invoice is wrong' }), context);

    expect(response.status).toBe(200);
    expect(mocks.appendHandoffMessage).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      author: 'user',
      body: 'My invoice is wrong',
    });
    expect(await response.json()).toEqual({
      message: {
        seq: 9,
        author: 'user',
        body: 'My invoice is wrong',
        at: '2026-09-28T00:00:02.000Z',
      },
    });
  });
});
