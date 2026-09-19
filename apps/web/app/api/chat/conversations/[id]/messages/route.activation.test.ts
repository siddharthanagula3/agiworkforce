import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), warn: vi.fn() }));

const db = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({ normalizeMessageMetadata: (value: unknown) => value }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: ORGANIZATION_ID })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('./lib/generate-title', () => ({ scheduleConversationTitleGeneration: vi.fn() }));
vi.mock('./lib/index-artifacts', () => ({ scheduleArtifactIndexing: vi.fn() }));

const { POST } = await import('./route');

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };
const ACTIVATION = /set activated_at = now\(\)/;
const MESSAGE_COUNT = /select count\(\*\).*from web_messages/i;

function request(): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'the first thing anyone said', role: 'user', skipLlm: true }),
    },
  );
}

function savedRow() {
  return {
    id: MESSAGE_ID,
    parent_id: null,
    role: 'user',
    content: 'the first thing anyone said',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    metadata: {},
  };
}

function activationCalls() {
  return mocks.execute.mock.calls.filter(([sql]) => ACTIVATION.test(String(sql)));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue(1);
  mocks.query
    .mockResolvedValueOnce([{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }])
    .mockResolvedValueOnce([savedRow()]);
});

describe('conversation activation', () => {
  it('stamps the conversation on its first user message, only while it is unset', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);

    const calls = activationCalls();
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0] as [string, unknown[]];
    expect(sql).toContain('activated_at is null');
    expect(params).toEqual([CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
    expect(mocks.query.mock.calls.some(([query]) => MESSAGE_COUNT.test(String(query)))).toBe(false);
  });

  it('still saves the message when the activation column is not there yet', async () => {
    mocks.query.mockResolvedValueOnce([{ count: '1' }]);
    mocks.execute.mockImplementation(async (sql: string) => {
      if (ACTIVATION.test(sql))
        throw Object.assign(new Error('column does not exist'), {
          code: '42703',
        });
      return 1;
    });

    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { message?: { id: string } };
    expect(body.message?.id).toBe(MESSAGE_ID);
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([query]) => MESSAGE_COUNT.test(String(query)))).toBe(true);
  });

  it('skips count and title work after the conversation is already activated', async () => {
    mocks.execute.mockImplementation(async (sql: string) => (ACTIVATION.test(sql) ? 0 : 1));

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls.some(([query]) => MESSAGE_COUNT.test(String(query)))).toBe(false);
    expect(mocks.execute.mock.calls).toHaveLength(1);
  });
});
