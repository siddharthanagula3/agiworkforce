import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/tier-unit-quota-service');

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

const { mockAssertFreeDailyAllowance } = vi.hoisted(() => ({
  mockAssertFreeDailyAllowance: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertFreeDailyAllowance: mockAssertFreeDailyAllowance,
}));

const { POST } = await import('./route');

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };
const ACTIVATION = /set activated_at = now\(\)/;
const MESSAGE_COUNT = /select count\(\*\).*from web_messages/i;
const TITLE_WRITE = /set title = \$1/;
const EARLIER_QUESTION_GUARD =
  /not exists \(\s*select 1\s+from web_messages earlier\s+where earlier\.conversation_id = \$2\s+and earlier\.role = 'user'\s+and earlier\.id <> \$5\s*\)/;
const ANSWERED_GUARD =
  /not exists \(\s*select 1\s+from web_messages answered\s+where answered\.conversation_id = \$2\s+and answered\.role = 'assistant'\s*\)/;
const ANSWER_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_QUESTION_ID = '77777777-7777-4777-8777-777777777777';
const { scheduleConversationTitleGeneration } = await import('./lib/generate-title');

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

type StoredMessage = { id: string; conversation_id: string; role: 'user' | 'assistant' };

function storedMessages(rows: StoredMessage[]) {
  mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (!TITLE_WRITE.test(sql)) return 1;
    const conversationId = params[1];
    const savedId = params[4];
    const inConversation = rows.filter((row) => row.conversation_id === conversationId);
    const otherQuestion =
      EARLIER_QUESTION_GUARD.test(sql) &&
      inConversation.some((row) => row.role === 'user' && row.id !== savedId);
    const answered =
      ANSWERED_GUARD.test(sql) && inConversation.some((row) => row.role === 'assistant');
    return otherQuestion || answered ? 0 : 1;
  });
}

function titleWrites() {
  return mocks.execute.mock.calls
    .map((call, index) => ({ call, result: mocks.execute.mock.results[index] }))
    .filter(({ call: [sql] }) => TITLE_WRITE.test(String(sql)));
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

  it('fails instead of guessing from a message count when activation cannot be stamped', async () => {
    mocks.execute.mockImplementation(async (sql: string) => {
      if (ACTIVATION.test(sql))
        throw Object.assign(new Error('column does not exist'), {
          code: '42703',
        });
      return 1;
    });

    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect(mocks.query.mock.calls.some(([query]) => MESSAGE_COUNT.test(String(query)))).toBe(false);
  });

  it('titles the conversation from the question that activates it when no earlier question exists', async () => {
    storedMessages([{ id: MESSAGE_ID, conversation_id: CONVERSATION_ID, role: 'user' }]);

    const response = await POST(request(), context);
    expect(response.status).toBe(200);

    const writes = titleWrites();
    expect(writes).toHaveLength(1);
    await expect(writes[0]?.result?.value).resolves.toBe(1);
    const [sql, params] = writes[0]?.call as [string, unknown[]];
    expect(sql).toMatch(EARLIER_QUESTION_GUARD);
    expect(sql).toMatch(ANSWERED_GUARD);
    expect(params).toEqual([
      'the first thing anyone said',
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
      MESSAGE_ID,
    ]);
    expect(scheduleConversationTitleGeneration).toHaveBeenCalledTimes(1);
    expect(scheduleConversationTitleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        content: 'the first thing anyone said',
        expectedCurrentTitle: 'the first thing anyone said',
      }),
    );
  });

  it('keeps the title when a regenerate re-sends the only question of a synced conversation that has an answer', async () => {
    storedMessages([
      { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, role: 'user' },
      { id: ANSWER_ID, conversation_id: CONVERSATION_ID, role: 'assistant' },
    ]);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(activationCalls()).toHaveLength(1);
    const writes = titleWrites();
    expect(writes).toHaveLength(1);
    await expect(writes[0]?.result?.value).resolves.toBe(0);
    expect(scheduleConversationTitleGeneration).not.toHaveBeenCalled();
  });

  it('keeps the title when an edit adds a new question to a synced conversation whose answer was never saved', async () => {
    storedMessages([
      { id: OTHER_QUESTION_ID, conversation_id: CONVERSATION_ID, role: 'user' },
      { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, role: 'user' },
    ]);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(activationCalls()).toHaveLength(1);
    await expect(titleWrites()[0]?.result?.value).resolves.toBe(0);
    expect(scheduleConversationTitleGeneration).not.toHaveBeenCalled();
  });

  it('judges the stored conversation by its own id, not by rows of another conversation', async () => {
    storedMessages([
      { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, role: 'user' },
      { id: ANSWER_ID, conversation_id: '99999999-9999-4999-8999-999999999999', role: 'assistant' },
    ]);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(scheduleConversationTitleGeneration).toHaveBeenCalledTimes(1);
  });

  it('skips count and title work after the conversation is already activated', async () => {
    mocks.execute.mockImplementation(async (sql: string) => (ACTIVATION.test(sql) ? 0 : 1));

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls.some(([query]) => MESSAGE_COUNT.test(String(query)))).toBe(false);
    expect(mocks.execute.mock.calls).toHaveLength(1);
  });
});
