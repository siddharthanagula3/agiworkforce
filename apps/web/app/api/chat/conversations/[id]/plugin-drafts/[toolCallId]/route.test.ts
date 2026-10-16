import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PLUGIN_DRAFT_RESULT_KEY, PLUGIN_DRAFT_TOOL_NAME } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  scope: { userId: 'user-1', organizationId: null as string | null },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: mocks.scope.userId,
    organizationId: mocks.scope.organizationId,
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: vi.fn(),
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
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/cors', () => ({
  appendVary: vi.fn(),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  isOriginAllowed: vi.fn(),
  jsonResponseWithCors: vi.fn(),
  requireValidOrigin: vi.fn(),
  withCorsAndSecurityHeaders: vi.fn(),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET } = await import('./route');

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const TOOL_CALL_ID = 'toolu_01WrKSkjWvtwgsfjqpNzzKCz';
const draft = {
  name: 'Long plugin',
  description: 'A plugin whose stored copy in the message was cut.',
  skills: [{ name: 'long-skill', description: 'Use it.', body: 'x'.repeat(3_000) }],
};

function call(id = CONVERSATION_ID, toolCallId = TOOL_CALL_ID) {
  const path = `/api/chat/conversations/${id}/plugin-drafts/${encodeURIComponent(toolCallId)}`;
  return GET(new NextRequest(`https://agiworkforce.com${path}`), {
    params: Promise.resolve({ id, toolCallId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.userId = 'user-1';
  mocks.scope.organizationId = null;
});

describe('GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId]', () => {
  it('returns the full stored draft to the conversation owner', async () => {
    mocks.query.mockResolvedValue([
      { output: JSON.stringify({ [PLUGIN_DRAFT_RESULT_KEY]: draft, shown: 'shown' }) },
    ]);
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ draft });
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toMatch(/c\.user_id = \$2/);
    expect(sql).toMatch(/c\.organization_id is not distinct from \$3/);
    expect(sql).toMatch(/c\.deleted_at is null/);
    expect(sql).toMatch(/'isError' = 'false'/);
    expect(params).toEqual([CONVERSATION_ID, 'user-1', null, TOOL_CALL_ID, PLUGIN_DRAFT_TOOL_NAME]);
  });

  it('answers not found to a caller who does not own the conversation', async () => {
    mocks.scope.userId = 'user-2';
    mocks.scope.organizationId = '22222222-2222-4222-8222-222222222222';
    mocks.query.mockResolvedValue([]);
    const response = await call();
    expect(response.status).toBe(404);
    expect(mocks.query.mock.calls[0]![1]).toEqual([
      CONVERSATION_ID,
      'user-2',
      '22222222-2222-4222-8222-222222222222',
      TOOL_CALL_ID,
      PLUGIN_DRAFT_TOOL_NAME,
    ]);
  });

  it('answers not found when no draft was stored for the call', async () => {
    mocks.query.mockResolvedValue([]);
    expect((await call()).status).toBe(404);
  });

  it('answers not found when the stored output is not a draft', async () => {
    mocks.query.mockResolvedValue([{ output: 'The draft cannot be saved yet.' }]);
    expect((await call()).status).toBe(404);
  });

  it('refuses a malformed conversation or tool call id without querying', async () => {
    expect((await call('not-a-uuid')).status).toBe(404);
    expect((await call(CONVERSATION_ID, 'bad id/../x')).status).toBe(404);
    expect((await call(CONVERSATION_ID, 'x'.repeat(257))).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
