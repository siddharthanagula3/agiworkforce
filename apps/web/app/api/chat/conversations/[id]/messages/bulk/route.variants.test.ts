import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_TURN_ID = '33333333-3333-4333-8333-333333333333';
const ASSISTANT_TURN_ID = '44444444-4444-4444-8444-444444444444';
const TAIL_ID = '55555555-5555-4555-8555-555555555555';
const EXISTING_LEAF_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const log: { sql: string; params: unknown[] }[] = [];
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
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: ORGANIZATION_ID })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
  resolveOrganizationMembershipId: vi.fn(),
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
vi.mock('../lib/index-artifacts', () => ({ scheduleArtifactIndexing: vi.fn() }));

const { POST } = await import('./route');

const CONVERSATION_SELECT = /select id, active_leaf_message_id/;
const LOCK = /for update/;
const CONVERSION = /lag\(id\) over/;
const BRANCH_PROBE = /select not exists/;
const TAIL = /order by created_at desc, id desc/;
const PARENT_CHECK = /select id from web_messages where id = \$1 and conversation_id = \$2/;
const INSERT = /insert into web_messages/;
const LEAF_SET = /update web_conversations\s+set active_leaf_message_id/;

type Responder = { match: RegExp; rows: unknown[] | ((params: unknown[]) => unknown[]) };

function givenDatabase(responders: Responder[]) {
  const answer = async (sql: string, params: unknown[] = []) => {
    log.push({ sql, params });
    const responder = responders.find((candidate) => candidate.match.test(sql));
    if (!responder) return [];
    return typeof responder.rows === 'function' ? responder.rows(params) : responder.rows;
  };
  mocks.query.mockImplementation(answer);
  mocks.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
    await answer(sql, params);
    return 1;
  });
}

const insertEchoesTheRow: Responder = {
  match: INSERT,
  rows: (params) => [
    {
      id: params[0],
      parent_id: params[6] ?? null,
      role: params[2],
      content: params[3],
      model: null,
      provider: null,
      input_tokens: 0,
      output_tokens: 0,
      created_at: '2026-09-01T00:00:00.000Z',
      metadata: {},
    },
  ],
};

function entries(pattern: RegExp): { sql: string; params: unknown[] }[] {
  return log.filter((call) => pattern.test(call.sql));
}

function entry(pattern: RegExp): { sql: string; params: unknown[] } | undefined {
  return entries(pattern)[0];
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages/bulk`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

const editedPair = {
  messages: [
    { id: USER_TURN_ID, role: 'user', content: 'the edited question', parentId: PARENT_ID },
    { id: ASSISTANT_TURN_ID, role: 'assistant', content: 'the new answer' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  log.length = 0;
});

describe('POST /api/chat/conversations/[id]/messages/bulk, sibling writes', () => {
  it('converts, then chains the batch through itself from the branch point', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: TAIL, rows: [{ id: TAIL_ID }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      insertEchoesTheRow,
    ]);

    const response = await POST(request(editedPair), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ saved: 2 });

    expect(entry(CONVERSION)).toBeDefined();
    const inserts = entries(INSERT);
    expect(inserts[0]?.params[6]).toBe(PARENT_ID);
    expect(inserts[1]?.params[6]).toBe(USER_TURN_ID);
    expect(entry(LEAF_SET)?.params).toEqual([
      ASSISTANT_TURN_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('starts an unparented batch at the end of the transcript it just converted', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: TAIL, rows: [{ id: TAIL_ID }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      insertEchoesTheRow,
    ]);

    await POST(
      request({
        messages: [
          { id: USER_TURN_ID, role: 'user', content: 'no parent here' },
          { id: ASSISTANT_TURN_ID, role: 'assistant', content: 'answer', parentId: PARENT_ID },
        ],
      }),
      context,
    );

    expect(entries(INSERT)[0]?.params[6]).toBe(TAIL_ID);
    expect(entries(INSERT)[1]?.params[6]).toBe(PARENT_ID);
  });

  it('continues from the active leaf when the batch names no parent at all', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: EXISTING_LEAF_ID }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      insertEchoesTheRow,
    ]);

    await POST(
      request({ messages: [{ id: USER_TURN_ID, role: 'user', content: 'from an older build' }] }),
      context,
    );

    expect(entry(CONVERSION)).toBeUndefined();
    expect(entry(TAIL)).toBeUndefined();
    expect(entry(INSERT)?.params[6]).toBe(EXISTING_LEAF_ID);
    expect(entry(LEAF_SET)?.params).toEqual([
      USER_TURN_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('keeps an explicit root parent at the root instead of reading it as absent', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: TAIL, rows: [{ id: TAIL_ID }] },
      insertEchoesTheRow,
    ]);

    await POST(
      request({
        messages: [
          {
            id: USER_TURN_ID,
            role: 'user',
            content: 'the edited opening question',
            parentId: null,
          },
          { id: ASSISTANT_TURN_ID, role: 'assistant', content: 'the new answer' },
        ],
      }),
      context,
    );

    expect(entry(CONVERSION)).toBeDefined();
    expect(entry(PARENT_CHECK)).toBeUndefined();
    expect(entries(INSERT)[0]?.params[6]).toBeNull();
    expect(entries(INSERT)[1]?.params[6]).toBe(USER_TURN_ID);
  });

  it('refuses a batch whose parent lives in another conversation', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: true }] },
      { match: TAIL, rows: [{ id: TAIL_ID }] },
      { match: PARENT_CHECK, rows: [] },
      insertEchoesTheRow,
    ]);

    const response = await POST(request(editedPair), context);

    expect(response.status).toBe(404);
    expect(entry(INSERT)).toBeUndefined();
    expect(entry(LEAF_SET)).toBeUndefined();
  });

  it('leaves an unbranched conversation on the path it has always taken', async () => {
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      insertEchoesTheRow,
    ]);

    const response = await POST(
      request({
        messages: [
          { id: USER_TURN_ID, role: 'user', content: 'hello' },
          { id: ASSISTANT_TURN_ID, role: 'assistant', content: 'hi' },
        ],
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(entry(LOCK)).toBeUndefined();
    expect(entry(CONVERSION)).toBeUndefined();
    expect(entry(LEAF_SET)).toBeUndefined();
    for (const insert of entries(INSERT)) expect(insert.params[6]).toBeNull();
  });

  it('does not re-chain the sibling roots when a deleted root leaves the leaf null', async () => {
    // Branched and leafless at once: deleting a root the reader was sitting on
    // sets the leaf to that row's parent, which is null for a root. Converting
    // here would chain the surviving roots into a single line, and the tail read
    // that follows would answer with the newest row across every branch.
    givenDatabase([
      {
        match: CONVERSATION_SELECT,
        rows: [{ id: CONVERSATION_ID, active_leaf_message_id: null }],
      },
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: BRANCH_PROBE, rows: [{ unbranched: false }] },
      { match: TAIL, rows: [{ id: TAIL_ID }] },
      { match: PARENT_CHECK, rows: [{ id: PARENT_ID }] },
      insertEchoesTheRow,
    ]);

    const response = await POST(
      request({
        messages: [
          { id: ASSISTANT_TURN_ID, role: 'assistant', content: 'hi', parentId: PARENT_ID },
        ],
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(entry(BRANCH_PROBE)).toBeDefined();
    expect(entry(CONVERSION)).toBeUndefined();
    expect(entry(TAIL)).toBeUndefined();
    expect(entries(INSERT)[0]?.params[6]).toBe(PARENT_ID);
  });
});
