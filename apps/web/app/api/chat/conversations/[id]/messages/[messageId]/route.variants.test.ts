import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_ID = '44444444-4444-4444-8444-444444444444';
const SIBLING_ID = '55555555-5555-4555-8555-555555555555';
const DEEPEST_ID = '66666666-6666-4666-8666-666666666666';
const ELSEWHERE_ID = '77777777-7777-4777-8777-777777777777';
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
vi.mock('@/lib/server/video-generation-transcript', () => ({
  failUnboundVideoGenerationTranscript: vi.fn(),
}));

const { DELETE } = await import('./route');

const OWNERSHIP = /select id\s+from web_conversations/;
const LOCK = /for update/;
const TARGET = /select id, parent_id from web_messages/;
const SPLICE = /set parent_id = \$1::uuid/;
const SUBTREE = /with recursive doomed/;
const SIBLING = /parent_id is not distinct from \$2::uuid/;
const DEEPEST = /newest_child/;
const LEAF_SET = /update web_conversations\s+set active_leaf_message_id/;
const REMOVE = /delete from web_messages/;

type Responder = { match: RegExp; rows: unknown[] };

function givenDatabase(responders: Responder[]) {
  const answer = async (sql: string, params: unknown[] = []) => {
    log.push({ sql, params });
    const responder = responders.find((candidate) => candidate.match.test(sql));
    return responder ? responder.rows : [];
  };
  mocks.query.mockImplementation(answer);
  mocks.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
    await answer(sql, params);
    return 1;
  });
}

function entry(pattern: RegExp): { sql: string; params: unknown[] } | undefined {
  return log.find((call) => pattern.test(call.sql));
}

function orderOf(pattern: RegExp): number {
  return log.findIndex((call) => pattern.test(call.sql));
}

function request(subtree = false): NextRequest {
  const query = subtree ? '?subtree=true' : '';
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}${query}`,
    { method: 'DELETE' },
  );
}

const context = { params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }) };

const owned: Responder = { match: OWNERSHIP, rows: [{ id: CONVERSATION_ID }] };
const parentedTarget: Responder = {
  match: TARGET,
  rows: [{ id: MESSAGE_ID, parent_id: PARENT_ID }],
};

beforeEach(() => {
  vi.clearAllMocks();
  log.length = 0;
});

describe('DELETE /api/chat/conversations/[id]/messages/[messageId], splice', () => {
  it('hands the children to their grandparent before the row goes', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      parentedTarget,
    ]);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    expect(entry(SPLICE)?.params).toEqual([PARENT_ID, CONVERSATION_ID, MESSAGE_ID]);
    expect(entry(REMOVE)?.params).toEqual([CONVERSATION_ID, [MESSAGE_ID]]);
    expect(orderOf(SPLICE)).toBeLessThan(orderOf(REMOVE));
  });

  it('moves the reader up to the parent when the row being deleted is where they are', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: MESSAGE_ID }] },
      parentedTarget,
    ]);

    await DELETE(request(), context);

    expect(entry(LEAF_SET)?.params).toEqual([PARENT_ID, CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
    expect(orderOf(LEAF_SET)).toBeLessThan(orderOf(REMOVE));
  });

  it('leaves the reader where they are when the deleted row is not on their path end', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: ELSEWHERE_ID }] },
      parentedTarget,
    ]);

    await DELETE(request(), context);

    expect(entry(LEAF_SET)).toBeUndefined();
    expect(entry(SUBTREE)).toBeUndefined();
    expect(entry(REMOVE)?.params).toEqual([CONVERSATION_ID, [MESSAGE_ID]]);
  });

  it('refuses a message that is not in this conversation and deletes nothing', async () => {
    givenDatabase([owned, { match: LOCK, rows: [{ active_leaf_message_id: null }] }]);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(404);
    expect(entry(REMOVE)).toBeUndefined();
    expect(entry(SPLICE)).toBeUndefined();
  });
});

describe('DELETE /api/chat/conversations/[id]/messages/[messageId], subtree', () => {
  const doomed: Responder = {
    match: SUBTREE,
    rows: [{ id: MESSAGE_ID }, { id: CHILD_ID }],
  };

  it('takes the variant and everything under it in one statement', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: ELSEWHERE_ID }] },
      parentedTarget,
      doomed,
    ]);

    const response = await DELETE(request(true), context);

    expect(response.status).toBe(200);
    expect(entry(REMOVE)?.params).toEqual([CONVERSATION_ID, [MESSAGE_ID, CHILD_ID]]);
    expect(entry(SPLICE)).toBeUndefined();
    expect(entry(LEAF_SET)).toBeUndefined();
  });

  it('sends the reader to the end of the newest surviving variant', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      parentedTarget,
      doomed,
      { match: SIBLING, rows: [{ id: SIBLING_ID }] },
      { match: DEEPEST, rows: [{ id: DEEPEST_ID }] },
    ]);

    await DELETE(request(true), context);

    expect(entry(SIBLING)?.params).toEqual([CONVERSATION_ID, PARENT_ID, MESSAGE_ID]);
    expect(entry(LEAF_SET)?.params).toEqual([
      DEEPEST_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
    expect(orderOf(LEAF_SET)).toBeLessThan(orderOf(REMOVE));
  });

  it('falls back to the branch point when the deleted variant was the last one', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      parentedTarget,
      doomed,
      { match: SIBLING, rows: [] },
    ]);

    await DELETE(request(true), context);

    expect(entry(DEEPEST)).toBeUndefined();
    expect(entry(LEAF_SET)?.params).toEqual([PARENT_ID, CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
  });

  it('goes back to linear when the deleted root subtree took the whole path with it', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      { match: TARGET, rows: [{ id: MESSAGE_ID, parent_id: null }] },
      doomed,
      { match: SIBLING, rows: [] },
    ]);

    await DELETE(request(true), context);

    expect(entry(LEAF_SET)?.params).toEqual([null, CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
  });
});

describe('DELETE /api/chat/conversations/[id]/messages/[messageId], leaf in the response', () => {
  const doomed: Responder = { match: SUBTREE, rows: [{ id: MESSAGE_ID }, { id: CHILD_ID }] };

  async function leafOf(response: Response): Promise<unknown> {
    return ((await response.json()) as { activeLeafMessageId: unknown }).activeLeafMessageId;
  }

  it('reports the surviving variant the reader has been moved to', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      parentedTarget,
      doomed,
      { match: SIBLING, rows: [{ id: SIBLING_ID }] },
      { match: DEEPEST, rows: [{ id: DEEPEST_ID }] },
    ]);

    await expect(leafOf(await DELETE(request(true), context))).resolves.toBe(DEEPEST_ID);
  });

  it('reports null once the deleted subtree leaves the conversation with no path', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: CHILD_ID }] },
      { match: TARGET, rows: [{ id: MESSAGE_ID, parent_id: null }] },
      doomed,
      { match: SIBLING, rows: [] },
    ]);

    await expect(leafOf(await DELETE(request(true), context))).resolves.toBeNull();
  });

  it('reports the untouched leaf when the delete never moved the reader', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: ELSEWHERE_ID }] },
      parentedTarget,
    ]);

    await expect(leafOf(await DELETE(request(), context))).resolves.toBe(ELSEWHERE_ID);
  });

  it('reports the parent a spliced delete moved the reader up to', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: MESSAGE_ID }] },
      parentedTarget,
    ]);

    await expect(leafOf(await DELETE(request(), context))).resolves.toBe(PARENT_ID);
  });

  it('stays null for a conversation that never became a tree', async () => {
    givenDatabase([
      owned,
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      parentedTarget,
    ]);

    const response = await DELETE(request(), context);

    expect(entry(LEAF_SET)).toBeUndefined();
    await expect(leafOf(response)).resolves.toBeNull();
  });
});
