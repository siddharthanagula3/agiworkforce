import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { StatementScanPostgres } from '@/lib/services/__tests__/statement-scan-postgres';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUMMARY = 'a summary of the turns this push is about to change';

type Call = { sql: string; params: unknown[] };

const mocks = vi.hoisted(() => ({
  pushRows: [] as unknown[],
  queries: [] as Call[],
  executes: [] as Call[],
}));

const db = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    mocks.queries.push({ sql, params });
    if (sql.includes('insert into web_messages')) return mocks.pushRows;
    if (sql.includes('active_leaf_message_id::text')) {
      return [
        { id: CONVERSATION_ID, organization_id: ORGANIZATION_ID, active_leaf_message_id: null },
      ];
    }
    return [];
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    mocks.executes.push({ sql, params });
    return 0;
  }),
  transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: ORGANIZATION_ID })),
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
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

const { POST } = await import('./route');

async function push(pushRows: unknown[]) {
  mocks.pushRows = pushRows;
  mocks.queries.length = 0;
  mocks.executes.length = 0;
  return POST(
    new NextRequest('https://example.invalid/api/chat/sync', {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: 2,
        messages: [
          {
            id: MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'user',
            content: 'a turn the summary does not know about',
            baseVersion: '0',
          },
        ],
      }),
    }),
  );
}

const applied = [{ kind: 'applied', id: MESSAGE_ID, server_version: '2', current: null }];
const conflicted = [{ kind: 'conflict', id: MESSAGE_ID, server_version: null, current: null }];

function conversation(id: string) {
  return {
    id,
    user_id: USER_ID,
    compaction_summary: SUMMARY,
    compaction_summary_through_message_id: MESSAGE_ID,
    compaction_summary_digest: 'a digest of the span it covered',
  };
}

describe('POST /api/chat/sync', () => {
  it('retires the compaction summary of the conversation whose turns it changed', async () => {
    const response = await push(applied);
    expect(response.status).toBe(200);
    expect(mocks.executes).toHaveLength(1);
    expect(mocks.executes[0]?.params).toEqual([USER_ID, [CONVERSATION_ID]]);
  });

  it('retires nothing when the batch changed nothing', async () => {
    const response = await push(conflicted);
    expect(response.status).toBe(200);
    expect(mocks.executes).toHaveLength(0);
  });

  it('nulls all three cached columns, and only for the conversations it names', async () => {
    await push(applied);
    const clear = mocks.executes[0]!;
    const store = new StatementScanPostgres({
      web_conversations: [conversation(CONVERSATION_ID), conversation(OTHER_CONVERSATION_ID)],
    });
    await store.execute(clear.sql, clear.params);

    const touched = store.rowsIn('web_conversations').find((row) => row['id'] === CONVERSATION_ID);
    expect(touched?.['compaction_summary']).toBeNull();
    expect(touched?.['compaction_summary_through_message_id']).toBeNull();
    expect(touched?.['compaction_summary_digest']).toBeNull();

    const untouched = store
      .rowsIn('web_conversations')
      .find((row) => row['id'] === OTHER_CONVERSATION_ID);
    expect(untouched?.['compaction_summary']).toBe(SUMMARY);
  });

  it('scopes the statement to the owner, so it cannot reach another account', async () => {
    await push(applied);
    const clear = mocks.executes[0]!;
    const store = new StatementScanPostgres({
      web_conversations: [{ ...conversation(CONVERSATION_ID), user_id: 'someone-else' }],
    });
    await store.execute(clear.sql, clear.params);

    expect(store.rowsIn('web_conversations')[0]?.['compaction_summary']).toBe(SUMMARY);
  });
});
