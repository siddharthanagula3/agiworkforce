import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const SIBLING_ID = '33333333-3333-4333-8333-333333333333';
const EXISTING_LEAF_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

const db: {
  query: typeof mocks.query;
  execute: typeof mocks.execute;
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
} = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: (fn) => fn(db),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  normalizeMessageMetadata: (value: unknown) => value,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: null })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('./lib/generate-title', () => ({ scheduleConversationTitleGeneration: vi.fn() }));
vi.mock('./lib/index-artifacts', () => ({ scheduleArtifactIndexing: vi.fn() }));

const { POST } = await import('./route');
const { INSERT_MESSAGE_SQL } = await import('./lib/message-thread');

const CONVERSATION_SELECT = /select id, model, active_leaf_message_id/;
const LOCK = /for update/;
const PARENT_CHECK = /select id from web_messages where id = \$1 and conversation_id = \$2/;
const CONVERSION = /lag\(id\) over \(order by created_at, id\)/;
const BRANCH_PROBE = /select not exists/;
const INSERT = /insert into web_messages/;
const LEAF_MOVE = /update web_conversations\s+set active_leaf_message_id/;
const MESSAGE_COUNT = /select count\(\*\)::text/;

type Responder = { match: RegExp; rows: unknown[] };

function savedRow(id: string, parentId: string | null, role = 'assistant') {
  return {
    id,
    parent_id: parentId,
    role,
    content: 'a second answer',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    metadata: {},
  };
}

function givenDatabase(responders: Responder[]) {
  mocks.query.mockImplementation(async (sql: string) => {
    const responder = responders.find((candidate) => candidate.match.test(sql));
    return responder ? responder.rows : [];
  });
  mocks.execute.mockResolvedValue(1);
}

function statements(calls: [string, unknown[]?][]): string[] {
  return calls.map(([sql]) => sql);
}

function ran(calls: [string, unknown[]?][], pattern: RegExp): boolean {
  return statements(calls).some((sql) => pattern.test(sql));
}

function paramsOf(calls: [string, unknown[]?][], pattern: RegExp): unknown[] {
  return calls.find(([sql]) => pattern.test(sql))?.[1] ?? [];
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/chat/conversations/[id]/messages — sibling writes', () => {
  it('converts a linear conversation once, then hangs the new row off its parent', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, PARENT_ID)] },
    ]);

    const response = await POST(
      request({
        id: SIBLING_ID,
        role: 'assistant',
        content: 'a second answer',
        parentId: PARENT_ID,
        skipLlm: true,
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: { id: SIBLING_ID, parent_id: PARENT_ID },
    });

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    const executes = mocks.execute.mock.calls as [string, unknown[]?][];

    expect(ran(queries, LOCK)).toBe(true);
    expect(ran(executes, CONVERSION)).toBe(true);
    expect(paramsOf(queries, INSERT)[6]).toBe(PARENT_ID);
    expect(paramsOf(executes, LEAF_MOVE)).toEqual([
      SIBLING_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('does not stamp parents a second time once the conversation carries a leaf', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: EXISTING_LEAF_ID }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, PARENT_ID)] },
    ]);

    await POST(
      request({
        id: SIBLING_ID,
        role: 'assistant',
        content: 'a second answer',
        parentId: PARENT_ID,
        skipLlm: true,
      }),
      context,
    );

    expect(ran(mocks.execute.mock.calls as [string, unknown[]?][], CONVERSION)).toBe(false);
    expect(ran(mocks.query.mock.calls as [string, unknown[]?][], INSERT)).toBe(true);
  });

  it('lets the loser of a conversion race read the winner leaf instead of converting again', async () => {
    // The pre-lock read saw a linear conversation; by the time this request owns
    // the row lock the concurrent first-variant write has committed its leaf.
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, PARENT_ID)] },
    ]);

    const response = await POST(
      request({
        id: SIBLING_ID,
        role: 'assistant',
        content: 'a second answer',
        parentId: PARENT_ID,
        skipLlm: true,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(ran(mocks.execute.mock.calls as [string, unknown[]?][], CONVERSION)).toBe(false);
    expect(paramsOf(mocks.query.mock.calls as [string, unknown[]?][], INSERT)[6]).toBe(PARENT_ID);
  });

  it('branches at the root when the edited turn is the first one', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, null, 'user')] },
      { match: MESSAGE_COUNT, rows: [{ count: '4' }] },
    ]);

    const response = await POST(
      request({
        id: SIBLING_ID,
        role: 'user',
        content: 'the edited opening question',
        parentId: null,
        skipLlm: true,
      }),
      context,
    );

    expect(response.status).toBe(200);

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    const executes = mocks.execute.mock.calls as [string, unknown[]?][];

    // An explicit null still converts the conversation, still moves the leaf,
    // and must not be read as "no parent given" and pushed onto the leaf.
    expect(ran(queries, LOCK)).toBe(true);
    expect(ran(executes, CONVERSION)).toBe(true);
    expect(ran(queries, PARENT_CHECK)).toBe(false);
    expect(paramsOf(queries, INSERT)[6]).toBeNull();
    expect(paramsOf(executes, LEAF_MOVE)).toEqual([
      SIBLING_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('refuses a parent that lives in another conversation', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: PARENT_CHECK, rows: [] },
    ]);

    const response = await POST(
      request({
        id: SIBLING_ID,
        role: 'assistant',
        content: 'a second answer',
        parentId: PARENT_ID,
        skipLlm: true,
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(ran(mocks.query.mock.calls as [string, unknown[]?][], INSERT)).toBe(false);
    expect(ran(mocks.execute.mock.calls as [string, unknown[]?][], CONVERSION)).toBe(false);
  });

  it('re-asserts a retried payload without letting it rewrite lineage', () => {
    const onConflict = INSERT_MESSAGE_SQL.slice(INSERT_MESSAGE_SQL.indexOf('on conflict'));

    expect(onConflict).toContain('set content = excluded.content');
    expect(onConflict).toContain('where web_messages.conversation_id = excluded.conversation_id');
    expect(onConflict.slice(0, onConflict.indexOf('returning'))).not.toContain('parent_id');
  });

  it('leaves an unbranched conversation on the single statement it has always used', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: INSERT, rows: [savedRow(SIBLING_ID, null, 'user')] },
      { match: MESSAGE_COUNT, rows: [{ count: '4' }] },
    ]);

    const response = await POST(
      request({ id: SIBLING_ID, role: 'user', content: 'plain turn', skipLlm: true }),
      context,
    );

    expect(response.status).toBe(200);

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    expect(ran(queries, LOCK)).toBe(false);
    expect(ran(mocks.execute.mock.calls as [string, unknown[]?][], LEAF_MOVE)).toBe(false);
    expect(paramsOf(queries, INSERT)[6]).toBeNull();
  });

  it('lands a parentless write on the active leaf rather than at the root', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: EXISTING_LEAF_ID }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, EXISTING_LEAF_ID, 'user')] },
      { match: MESSAGE_COUNT, rows: [{ count: '9' }] },
    ]);

    await POST(
      request({ id: SIBLING_ID, role: 'user', content: 'from an older build', skipLlm: true }),
      context,
    );

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    expect(ran(queries, PARENT_CHECK)).toBe(false);
    expect(paramsOf(queries, INSERT)[6]).toBe(EXISTING_LEAF_ID);
    expect(paramsOf(mocks.execute.mock.calls as [string, unknown[]?][], LEAF_MOVE)).toEqual([
      SIBLING_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('does not re-chain the sibling roots when a branched conversation has no leaf', async () => {
    // The reader edited the opening question twice, then deleted the newest
    // root without its subtree. That delete sets the leaf to the deleted row's
    // parent, which is null for a root, so the conversation is branched and
    // leafless at once. Converting here would run lag() across the roots and
    // chain each deliberate sibling onto whichever one happens to precede it.
    //
    // The conversation PATCH reaches the same state directly, since it accepts
    // activeLeafMessageId: null as the reset to linear. Which of the two wrote
    // the null is not knowable from here, and must not be: the gate reads the
    // tree precisely so that the answer does not depend on provenance.
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: false }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      { match: INSERT, rows: [savedRow(SIBLING_ID, PARENT_ID)] },
    ]);

    const response = await POST(
      request({
        id: SIBLING_ID,
        role: 'assistant',
        content: 'the answer to the surviving question',
        parentId: PARENT_ID,
        skipLlm: true,
      }),
      context,
    );

    expect(response.status).toBe(200);

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    const executes = mocks.execute.mock.calls as [string, unknown[]?][];

    expect(ran(queries, BRANCH_PROBE)).toBe(true);
    expect(ran(executes, CONVERSION)).toBe(false);
    // The write still lands where it was told, and still restores a real leaf.
    expect(paramsOf(queries, INSERT)[6]).toBe(PARENT_ID);
    expect(paramsOf(executes, LEAF_MOVE)).toEqual([
      SIBLING_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('starts a root rather than a conversion when a plain send follows a null leaf', async () => {
    // The sequence a client performs right after resetting a branched
    // conversation to linear: no parent named, no leaf to continue from. This
    // one never reaches the gate at all — it takes the single statement, which
    // is the reason a client-reachable null leaf cannot re-parent anything.
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, model: null, active_leaf_message_id: null }],
      },
      { match: INSERT, rows: [savedRow(SIBLING_ID, null, 'user')] },
      { match: MESSAGE_COUNT, rows: [{ count: '6' }] },
    ]);

    const response = await POST(
      request({ id: SIBLING_ID, role: 'user', content: 'carrying on', skipLlm: true }),
      context,
    );

    expect(response.status).toBe(200);

    const queries = mocks.query.mock.calls as [string, unknown[]?][];
    const executes = mocks.execute.mock.calls as [string, unknown[]?][];

    expect(ran(queries, LOCK)).toBe(false);
    expect(ran(queries, BRANCH_PROBE)).toBe(false);
    expect(ran(executes, CONVERSION)).toBe(false);
    expect(ran(executes, LEAF_MOVE)).toBe(false);
    expect(paramsOf(queries, INSERT)[6]).toBeNull();
  });
});
