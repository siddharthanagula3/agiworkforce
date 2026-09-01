import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ANSWER_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_ANSWER_ID = '44444444-4444-4444-8444-444444444444';
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
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

// The lock reads the same column as the pre-read, so it has to be matched
// first: every responder list below is searched in order.
const LOCK = /for update/;
const CONVERSATION_SELECT = /select active_leaf_message_id/;
const LEAF_ROW = /select role, parent_id from web_messages/;
const EXISTS_PROBE = /select id from web_messages where id = \$1 and conversation_id = \$2/;
const INSERT = /insert into web_messages/;
const LEAF_MOVE = /update web_conversations\s+set active_leaf_message_id/;

const PARENT_PARAM = 10;

type Responder = { match: RegExp; rows: unknown[] };

function givenDatabase(responders: Responder[]) {
  mocks.query.mockImplementation(async (sql: string) => {
    const responder = responders.find((candidate) => candidate.match.test(sql));
    return responder ? responder.rows : [];
  });
  mocks.execute.mockResolvedValue(1);
}

function ran(calls: [string, unknown[]?][], pattern: RegExp): boolean {
  return calls.some(([sql]) => pattern.test(sql));
}

function paramsOf(calls: [string, unknown[]?][], pattern: RegExp): unknown[] {
  return calls.find(([sql]) => pattern.test(sql))?.[1] ?? [];
}

function queries(): [string, unknown[]?][] {
  return mocks.query.mock.calls as [string, unknown[]?][];
}

function executes(): [string, unknown[]?][] {
  return mocks.execute.mock.calls as [string, unknown[]?][];
}

function persist() {
  return persistAssistantTurn({
    userId: USER_ID,
    processed: {
      requestId: 'request-1',
      organizationId: ORGANIZATION_ID,
      conversationId: CONVERSATION_ID,
      assistantMessageId: NEW_ANSWER_ID,
      conversationIsTemporary: false,
    } as ProcessedRequest,
    snapshot: {
      content: 'the answer',
      model: 'fixture-model',
      provider: 'fixture-provider',
      inputTokens: 10,
      outputTokens: 2,
      truncated: false,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('persistAssistantTurn — threaded conversations', () => {
  it('leaves an unbranched conversation on the single statement it has always used', async () => {
    givenDatabase([{ match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: null }] }]);

    await persist();

    expect(ran(queries(), LOCK)).toBe(false);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
    expect(ran(executes(), INSERT)).toBe(true);
    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBeNull();
  });

  it('never locks for a conversation this request cannot see', async () => {
    givenDatabase([{ match: CONVERSATION_SELECT, rows: [] }]);
    mocks.execute.mockResolvedValue(0);

    await persist();

    expect(ran(queries(), LOCK)).toBe(false);
    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBeNull();
  });

  it('answers the question the reader is on and moves the path onto the answer', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: EXISTS_PROBE, rows: [] },
      { match: LEAF_ROW, rows: [{ role: 'user', parent_id: PREVIOUS_ANSWER_ID }] },
    ]);

    await persist();

    expect(ran(queries(), LOCK)).toBe(true);
    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBe(QUESTION_ID);
    expect(paramsOf(executes(), LEAF_MOVE)).toEqual([
      NEW_ANSWER_ID,
      CONVERSATION_ID,
      USER_ID,
      ORGANIZATION_ID,
    ]);
  });

  it('makes a regenerated answer a sibling of the one it replaces, not its child', async () => {
    // Regeneration posts no question before the stream, so the leaf is still
    // the previous answer. Hanging the new one off it would append a turn.
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: PREVIOUS_ANSWER_ID }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: PREVIOUS_ANSWER_ID }] },
      { match: EXISTS_PROBE, rows: [] },
      { match: LEAF_ROW, rows: [{ role: 'assistant', parent_id: QUESTION_ID }] },
    ]);

    await persist();

    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBe(QUESTION_ID);
    expect(paramsOf(executes(), LEAF_MOVE)[0]).toBe(NEW_ANSWER_ID);
  });

  it('re-asserts a replayed turn without dragging the path back onto it', async () => {
    // A cloud agent run can settle after the client saved this same row and the
    // conversation moved on; the content update must not move the leaf.
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: EXISTS_PROBE, rows: [{ id: NEW_ANSWER_ID }] },
      { match: LEAF_ROW, rows: [{ role: 'user', parent_id: null }] },
    ]);

    await persist();

    expect(ran(executes(), INSERT)).toBe(true);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
  });

  it('resolves the same parent on replay rather than parenting a turn to itself', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: NEW_ANSWER_ID }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: NEW_ANSWER_ID }] },
      { match: EXISTS_PROBE, rows: [{ id: NEW_ANSWER_ID }] },
      { match: LEAF_ROW, rows: [{ role: 'assistant', parent_id: QUESTION_ID }] },
    ]);

    await persist();

    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBe(QUESTION_ID);
  });

  it('takes the linear write when the branch is undone before it owns the lock', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: null }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: QUESTION_ID }] },
    ]);

    await persist();

    expect(ran(queries(), LOCK)).toBe(true);
    expect(ran(queries(), LEAF_ROW)).toBe(false);
    expect(ran(executes(), LEAF_MOVE)).toBe(false);
    expect(paramsOf(executes(), INSERT)[PARENT_PARAM]).toBeNull();
  });

  it('leaves the path alone when the insert writes no row', async () => {
    givenDatabase([
      { match: LOCK, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: QUESTION_ID }] },
      { match: EXISTS_PROBE, rows: [] },
      { match: LEAF_ROW, rows: [{ role: 'user', parent_id: null }] },
    ]);
    mocks.execute.mockResolvedValue(0);

    await persist();

    expect(ran(executes(), LEAF_MOVE)).toBe(false);
  });

  it('re-asserts a retried payload without letting it rewrite lineage', async () => {
    givenDatabase([{ match: CONVERSATION_SELECT, rows: [{ active_leaf_message_id: null }] }]);

    await persist();

    const [sql] = executes().find(([text]) => INSERT.test(text)) as [string, unknown[]?];
    const onConflict = sql.slice(sql.indexOf('on conflict'));

    expect(onConflict).toContain('set content = excluded.content');
    expect(onConflict).toContain('where web_messages.conversation_id = excluded.conversation_id');
    expect(onConflict).not.toContain('parent_id');
  });
});
