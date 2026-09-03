import { describe, it, expect, vi, beforeEach } from 'vitest';

const CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000c1';
const OTHER_CONVERSATION_ID = '0190a000-0000-7000-8000-0000000000c2';
const EXISTING_LEAF_ID = '0190a000-0000-7000-8000-0000000000d0';
const FIRST_ID = '0190a000-0000-7000-8000-0000000000d1';
const SECOND_ID = '0190a000-0000-7000-8000-0000000000d2';
const THIRD_ID = '0190a000-0000-7000-8000-0000000000d3';
const USER_ID = 'u1';
const ORGANIZATION_ID = '0190a000-0000-7000-8000-0000000000ff';

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

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db,
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

import { POST } from '@/app/api/chat/sync/route';
import { NextRequest } from 'next/server';

// The lock reads the same column as the pre-read, so it has to be matched
// first: every responder list below is searched in order.
const LOCK = /for update/;
const LEAF_SCAN = /organization_id::text as organization_id/;
const TAKEN_SCAN = /from web_messages where id = any/;
const BATCH = /insert into web_messages/;
const LEAF_MOVE = /update web_conversations\s+set active_leaf_message_id/;

type Responder = { match: RegExp; rows: unknown[] };

function givenDatabase(responders: Responder[]) {
  mocks.query.mockImplementation(async (sql: string) => {
    const responder = responders.find((candidate) => candidate.match.test(sql));
    return responder ? responder.rows : [];
  });
  mocks.execute.mockResolvedValue(1);
}

function appliedRows(ids: string[]) {
  return ids.map((id) => ({ kind: 'applied', id, server_version: '1', current: null }));
}

function pushed(id: string, conversationId = CONVERSATION_ID, baseVersion = '0') {
  return { id, conversationId, role: 'user' as const, content: `m ${id}`, baseVersion };
}

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function push(messages: unknown[]) {
  return POST(postReq({ protocolVersion: 2, messages }));
}

function queries(): [string, unknown[]?][] {
  return mocks.query.mock.calls as [string, unknown[]?][];
}

function executes(): [string, unknown[]?][] {
  return mocks.execute.mock.calls as [string, unknown[]?][];
}

function ran(calls: [string, unknown[]?][], pattern: RegExp): boolean {
  return calls.some(([sql]) => pattern.test(sql));
}

function paramsOf(calls: [string, unknown[]?][], pattern: RegExp): unknown[] {
  return calls.find(([sql]) => pattern.test(sql))?.[1] ?? [];
}

function threadParentsOf(): Array<{ id: string; parentId: string | null }> {
  return JSON.parse(String(paramsOf(queries(), BATCH)[2] ?? '[]'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/chat/sync, threaded pushes', () => {
  it('leaves an unbranched conversation parentless and never locks it', async () => {
    givenDatabase([
      {
        match: LEAF_SCAN,
        rows: [
          { id: CONVERSATION_ID, organization_id: ORGANIZATION_ID, active_leaf_message_id: null },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    const response = await push([pushed(FIRST_ID)]);

    expect(response.status).toBe(200);
    expect(ran(queries(), LOCK)).toBe(false);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
    expect(threadParentsOf()).toEqual([]);
  });

  it('threads a batch sequentially and leaves the path on its last row', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID, SECOND_ID, THIRD_ID]) },
    ]);

    const response = await push([pushed(FIRST_ID), pushed(SECOND_ID), pushed(THIRD_ID)]);

    expect(response.status).toBe(200);
    expect(threadParentsOf()).toEqual([
      { id: FIRST_ID, parentId: EXISTING_LEAF_ID },
      { id: SECOND_ID, parentId: FIRST_ID },
      { id: THIRD_ID, parentId: SECOND_ID },
    ]);
    expect(paramsOf(executes(), LEAF_MOVE)).toEqual([
      THIRD_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('chains each conversation from its own leaf', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
          {
            id: OTHER_CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID, SECOND_ID]) },
    ]);

    await push([pushed(FIRST_ID), pushed(SECOND_ID, OTHER_CONVERSATION_ID)]);

    expect(threadParentsOf()).toEqual([
      { id: FIRST_ID, parentId: EXISTING_LEAF_ID },
      { id: SECOND_ID, parentId: EXISTING_LEAF_ID },
    ]);
    expect(executes().filter(([sql]) => LEAF_MOVE.test(sql))).toHaveLength(2);
  });

  it('gives an edit no lineage and leaves the path where the reader left it', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    await push([pushed(FIRST_ID, CONVERSATION_ID, '7')]);

    expect(threadParentsOf()).toEqual([]);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
    // Nothing in the batch needs a parent, so the conversation is never locked.
    expect(ran(queries(), LOCK)).toBe(false);
  });

  it('never chains the row behind an id the table already holds', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: TAKEN_SCAN, rows: [{ id: FIRST_ID }] },
      { match: BATCH, rows: appliedRows([SECOND_ID]) },
    ]);

    await push([pushed(FIRST_ID), pushed(SECOND_ID)]);

    const parents = threadParentsOf();
    expect(parents.some((parent) => parent.parentId === FIRST_ID)).toBe(false);
    expect(parents.some((parent) => parent.id === FIRST_ID)).toBe(false);
    expect(parents).toEqual([{ id: SECOND_ID, parentId: EXISTING_LEAF_ID }]);
    expect(paramsOf(executes(), LEAF_MOVE)[0]).toBe(SECOND_ID);
  });

  it('asks about every id it is about to chain, and only those', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    await push([pushed(FIRST_ID), pushed(SECOND_ID, CONVERSATION_ID, '7')]);

    // The edit carries a base version, so it is never a candidate parent and
    // has no business widening the lookup.
    expect(paramsOf(queries(), TAKEN_SCAN)[0]).toEqual([FIRST_ID]);
  });

  it('leaves a conversation untouched when every new row it carries is taken', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: TAKEN_SCAN, rows: [{ id: FIRST_ID }] },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    await push([pushed(FIRST_ID)]);

    expect(threadParentsOf()).toEqual([]);
    expect(ran(queries(), LOCK)).toBe(false);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
  });

  it('refuses to point the path at a row the batch did not write', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      {
        match: BATCH,
        rows: [{ kind: 'conflict', id: FIRST_ID, server_version: null, current: null }],
      },
    ]);

    await push([pushed(FIRST_ID)]);

    expect(threadParentsOf()).toEqual([{ id: FIRST_ID, parentId: EXISTING_LEAF_ID }]);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
  });

  it('threads a conversation the push can write but the active workspace does not hold', async () => {
    // The batch admits any conversation its owner owns, so the thread has to
    // reach as far as the insert does or those rows land with no parent.
    const OTHER_WORKSPACE_ID = '0190a000-0000-7000-8000-0000000000fe';
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: EXISTING_LEAF_ID }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: OTHER_WORKSPACE_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    await push([pushed(FIRST_ID)]);

    expect(threadParentsOf()).toEqual([{ id: FIRST_ID, parentId: EXISTING_LEAF_ID }]);
    expect(paramsOf(queries(), LOCK)[2]).toBe(OTHER_WORKSPACE_ID);
    expect(paramsOf(executes(), LEAF_MOVE)).toEqual([
      FIRST_ID,
      CONVERSATION_ID,
      USER_ID,
      OTHER_WORKSPACE_ID,
    ]);
  });

  it('takes the linear write when the branch is undone before it owns the lock', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      {
        match: LEAF_SCAN,
        rows: [
          {
            id: CONVERSATION_ID,
            organization_id: ORGANIZATION_ID,
            active_leaf_message_id: EXISTING_LEAF_ID,
          },
        ],
      },
      { match: BATCH, rows: appliedRows([FIRST_ID]) },
    ]);

    await push([pushed(FIRST_ID)]);

    expect(ran(queries(), LOCK)).toBe(true);
    expect(threadParentsOf()).toEqual([]);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
  });
});
