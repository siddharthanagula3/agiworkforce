import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/app/api/chat/conversations/[id]/messages/lib/message-thread');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  assertFreeDailyAllowance: vi.fn(),
  scheduleArtifactIndexing: vi.fn(),
  setActiveLeaf: vi.fn(),
  query: vi.fn(),
  txQuery: vi.fn(),
  txExecute: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/tier-unit-quota-service', () => ({
  FreeDailyLimitError: class FreeDailyLimitError extends Error {},
  assertTierUnitAllowance: vi.fn(),
  freeDailyLimitError: vi.fn(),
  getTierUnitAllowance: vi.fn(),
  hasDailyAllowance: vi.fn(),
  readTierUnitUsage: vi.fn(),
  assertFreeDailyAllowance: mocks.assertFreeDailyAllowance,
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  indexMessageArtifacts: vi.fn(),
  scheduleArtifactIndexing: mocks.scheduleArtifactIndexing,
}));
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/message-thread',
  async (importOriginal) => ({
    ...(await importOriginal<ScanModule0>()),
    setActiveLeaf: mocks.setActiveLeaf,
  }),
);

import { createError } from '@/lib/errors';
import { POST } from '../route';

const CONVERSATION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const USER_MESSAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ASSISTANT_MESSAGE = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

const tx = { query: mocks.txQuery, execute: mocks.txExecute };
const db = {
  query: mocks.query,
  transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => run(tx)),
};

function call(body: unknown, id = CONVERSATION) {
  return POST(
    new NextRequest(`http://localhost/api/chat/conversations/${id}/keep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const MESSAGES = [
  { id: USER_MESSAGE, role: 'user', content: ' Plan my week ' },
  { role: 'assistant', content: 'Here is a plan', model: 'claude-fast' },
  { role: 'user', content: '   ' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
  mocks.query.mockResolvedValue([{ is_temporary: true }]);
  mocks.assertFreeDailyAllowance.mockResolvedValue(undefined);
  mocks.txExecute.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  mocks.txQuery
    .mockResolvedValueOnce([
      { id: USER_MESSAGE, role: 'user', content: 'Plan my week', metadata: {} },
    ])
    .mockResolvedValueOnce([
      { id: ASSISTANT_MESSAGE, role: 'assistant', content: 'Here is a plan', metadata: {} },
    ]);
  mocks.setActiveLeaf.mockResolvedValue(undefined);
});

describe('POST /api/chat/conversations/[id]/keep', () => {
  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await call({ messages: MESSAGES }, 'chat-1');

    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const invalidJson = await call('{');
    expect(invalidJson.status).toBe(400);

    const wrongRole = await call({ messages: [{ role: 'system', content: 'x' }] });
    expect(wrongRole.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(401);
  });

  it('answers 404 for a chat the caller does not own', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(404);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('answers 409 when the chat is already saved', async () => {
    mocks.query.mockResolvedValue([{ is_temporary: false }]);

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(409);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('answers 409 when a concurrent save won the race', async () => {
    mocks.txExecute.mockReset().mockResolvedValue(0);

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(409);
    expect(mocks.txQuery).not.toHaveBeenCalled();
  });

  it('refuses when the free daily allowance is spent', async () => {
    mocks.assertFreeDailyAllowance.mockRejectedValue(createError.rateLimit('Daily limit'));

    const response = await call({ messages: MESSAGES });

    expect(response.status).toBe(429);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('saves the non-empty messages as a chain and indexes the assistant reply', async () => {
    const response = await call({ title: 'Week plan', messages: MESSAGES });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kept: 2, keptFiles: 2 });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('from web_conversations'), [
      CONVERSATION,
      'user-1',
      'org-1',
    ]);
    expect(mocks.assertFreeDailyAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', requested: { message_writes: 2 } }),
    );
    expect(mocks.txExecute.mock.calls[0]?.[1]).toEqual([
      CONVERSATION,
      'user-1',
      'org-1',
      'Week plan',
    ]);
    expect(mocks.txQuery.mock.calls[0]?.[1]).toEqual([
      USER_MESSAGE,
      CONVERSATION,
      'user',
      'Plan my week',
      null,
      '{}',
      null,
    ]);
    expect(mocks.txQuery.mock.calls[1]?.[1]).toEqual([
      null,
      CONVERSATION,
      'assistant',
      'Here is a plan',
      'claude-fast',
      '{}',
      USER_MESSAGE,
    ]);
    expect(mocks.setActiveLeaf).toHaveBeenCalledWith(
      tx,
      { conversationId: CONVERSATION, userId: 'user-1', organizationId: 'org-1' },
      ASSISTANT_MESSAGE,
    );
    expect(mocks.scheduleArtifactIndexing).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleArtifactIndexing).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', messageId: ASSISTANT_MESSAGE }),
    );
  });
});
