import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user_contract_1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  })),
}));

import { GET, POST } from '../route';

const CONV_ID = '018f6f2a-0000-7000-8000-000000000001';
const MSG_ID = '018f6f2a-0000-7000-8000-000000000002';
const ART_ID = '018f6f2a-0000-7000-8000-000000000003';
const PROJECT_ID = '018f6f2a-0000-7000-8000-000000000004';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const conversationRow = {
  id: CONV_ID,
  title: 'Quarterly plan',
  model: 'model-x',
  project_id: null,
  pinned: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  deleted_at: null,
  server_version: '42',
};

const messageRow = {
  id: MSG_ID,
  conversation_id: CONV_ID,
  role: 'assistant',
  content: 'Here is the plan…',
  model: 'model-x',
  provider: 'provider-y',
  input_tokens: 120,
  output_tokens: 480,
  cost_cents: 3,
  metadata: null,
  created_at: '2026-07-02T00:00:01.000Z',
  updated_at: '2026-07-02T00:00:01.000Z',
  deleted_at: null,
  server_version: '43',
};

const artifactRow = {
  id: ART_ID,
  conversation_id: CONV_ID,
  message_id: MSG_ID,
  title: 'plan.md',
  artifact_type: 'markdown',
  language: null,
  content: '# Plan',
  current_version: 1,
  pinned: false,
  tags: [],
  created_at: '2026-07-02T00:00:02.000Z',
  updated_at: '2026-07-02T00:00:02.000Z',
  deleted_at: null,
  server_version: '44',
};

function makeGet(since = '0') {
  return new Request(`http://localhost:3000/api/chat/sync?since=${since}`, {
    method: 'GET',
  }) as never;
}

function makePost(body: unknown) {
  return new Request('http://localhost:3000/api/chat/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('GET /api/chat/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pull page with rows parses against ChatSyncPullResponseSchema', async () => {
    mockQuery
      .mockResolvedValueOnce([conversationRow])
      .mockResolvedValueOnce([messageRow])
      .mockResolvedValueOnce([artifactRow]);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages[0]).not.toHaveProperty('cost_cents');
    const parsed = ChatSyncPullResponseSchema.safeParse(body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cursor).toBe('44');
      expect(parsed.data.hasMore).toBe(false);
    }
  });

  it('parses a page whose timestamps arrive as Date objects (real node-postgres rows)', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          ...conversationRow,
          created_at: new Date('2026-07-01T00:00:00.000Z'),
          updated_at: new Date('2026-07-02T00:00:00.000Z'),
          deleted_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...messageRow,
          created_at: new Date('2026-07-02T00:00:01.000Z'),
          updated_at: new Date('2026-07-02T00:00:01.000Z'),
          deleted_at: new Date('2026-07-03T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          ...artifactRow,
          created_at: new Date('2026-07-02T00:00:02.000Z'),
          updated_at: new Date('2026-07-02T00:00:02.000Z'),
          deleted_at: null,
        },
      ]);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = ChatSyncPullResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.conversations[0].created_at).toBe('2026-07-01T00:00:00.000Z');
    expect(body.messages[0].deleted_at).toBe('2026-07-03T00:00:00.000Z');
    expect(body.artifacts[0].updated_at).toBe('2026-07-02T00:00:02.000Z');
  });

  it('empty pull page parses', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await GET(makeGet('99'));
    const parsed = ChatSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('99');
  });

  it('rejects a cursor outside the PostgreSQL bigint range before querying', async () => {
    const res = await GET(makeGet('9999999999999999999'));

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('selects both branch pointers and delivers them on the pull page', async () => {
    const PARENT_ID = '018f6f2a-0000-7000-8000-00000000000a';
    const LEAF_ID = '018f6f2a-0000-7000-8000-00000000000b';
    mockQuery
      .mockResolvedValueOnce([{ ...conversationRow, active_leaf_message_id: LEAF_ID }])
      .mockResolvedValueOnce([{ ...messageRow, parent_id: PARENT_ID }])
      .mockResolvedValueOnce([]);

    const res = await GET(makeGet());
    const body = await res.json();

    const [conversationSql] = mockQuery.mock.calls[0] as [string];
    const [messageSql] = mockQuery.mock.calls[1] as [string];
    expect(conversationSql).toContain('active_leaf_message_id::text as active_leaf_message_id');
    expect(messageSql).toContain('m.parent_id::text as parent_id');
    expect(body.conversations[0].active_leaf_message_id).toBe(LEAF_ID);
    expect(body.messages[0].parent_id).toBe(PARENT_ID);
    expect(ChatSyncPullResponseSchema.safeParse(body).success).toBe(true);
  });

  it('sends a null pointer rather than dropping it, so a linear chat is not read as legacy', async () => {
    mockQuery
      .mockResolvedValueOnce([{ ...conversationRow, active_leaf_message_id: null }])
      .mockResolvedValueOnce([{ ...messageRow, parent_id: null }])
      .mockResolvedValueOnce([]);

    const body = await (await GET(makeGet())).json();

    expect(body.conversations[0]).toHaveProperty('active_leaf_message_id', null);
    expect(body.messages[0]).toHaveProperty('parent_id', null);
  });

  it('issues the three delta pulls concurrently, not one round trip after another', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const rowsFor = (sql: string) => {
      if (sql.includes('from web_conversations')) return [conversationRow];
      if (sql.includes('from web_messages')) return [messageRow];
      return [artifactRow];
    };

    mockQuery.mockImplementation(async (sql: string) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return rowsFor(sql);
    });

    const res = await GET(makeGet());

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(peakInFlight).toBe(3);

    const parsed = ChatSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('44');
  });
});

describe('POST /api/chat/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('push ack parses against ChatSyncPushResponseSchema', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('insert into web_conversations')) {
        return [{ kind: 'applied', id: CONV_ID, server_version: '45', current: null }];
      }
      if (String(sql).includes('insert into web_messages')) {
        return [{ kind: 'applied', id: MSG_ID, server_version: '46', current: null }];
      }
      return [];
    });

    const res = await POST(
      makePost({
        protocolVersion: 2,
        conversations: [{ id: CONV_ID, title: 'Quarterly plan', baseVersion: '0' }],
        messages: [
          {
            id: MSG_ID,
            conversationId: CONV_ID,
            role: 'user',
            content: 'hello',
            baseVersion: '0',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);

    const parsed = ChatSyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('46');
  });

  it('accepts a project only after proving owner and exact active workspace', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: PROJECT_ID }])
      .mockResolvedValueOnce([
        { kind: 'applied', id: CONV_ID, server_version: '45', current: null },
      ]);

    const res = await POST(
      makePost({
        protocolVersion: 2,
        conversations: [
          { id: CONV_ID, title: 'Scoped project chat', projectId: PROJECT_ID, baseVersion: '0' },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const [validationSql, validationParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(validationSql).toContain('user_id = $1');
    expect(validationSql).toContain('organization_id is not distinct from $2::uuid');
    expect(validationParams).toEqual(['user_contract_1', ORGANIZATION_ID, [PROJECT_ID]]);
    const [mutationSql, mutationParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(mutationSql).toContain('project.organization_id is not distinct from $3::uuid');
    expect(mutationParams).toEqual(['user_contract_1', expect.any(String), ORGANIZATION_ID]);
  });

  it('rejects a project outside the active workspace before mutating conversations', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await POST(
      makePost({
        protocolVersion: 2,
        conversations: [
          { id: CONV_ID, title: 'Foreign project chat', projectId: PROJECT_ID, baseVersion: '0' },
        ],
      }),
    );

    expect(res.status).toBe(400);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('uses the server revision as the compare-and-swap guard for message updates', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('insert into web_messages')
        ? [{ kind: 'applied', id: MSG_ID, server_version: '47', current: null }]
        : [],
    );

    const res = await POST(
      makePost({
        protocolVersion: 2,
        messages: [
          {
            id: MSG_ID,
            conversationId: CONV_ID,
            role: 'assistant',
            content: 'final streamed content',
            metadata: { cloudApproval: null },
            baseVersion: '46',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const sql = String(
      mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('insert into web_messages'),
      )?.[0],
    );
    expect(sql).toContain('existing.server_version = incoming.base_version');
    expect(sql).toContain('content = incoming.content');
    expect(sql).toContain("item ? 'metadata' as has_metadata");
    expect(sql).toContain(
      'metadata = case when incoming.has_metadata then incoming.metadata else existing.metadata end',
    );
    expect(sql).toContain(
      'input_tokens = case when incoming.has_input_tokens then incoming.input_tokens else existing.input_tokens end',
    );
    expect(sql).not.toContain('cost_cents');
  });

  it('strips private provider cost from message conflict rows', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('insert into web_messages')
        ? [{ kind: 'conflict', id: MSG_ID, server_version: null, current: messageRow }]
        : [],
    );

    const res = await POST(
      makePost({
        protocolVersion: 2,
        messages: [
          {
            id: MSG_ID,
            conversationId: CONV_ID,
            role: 'assistant',
            content: 'stale content',
            baseVersion: '42',
          },
        ],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conflicts.messages[0].current).not.toHaveProperty('cost_cents');
  });

  it('builds the message thread argument from the server leaf, never from the pushed item', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('insert into web_messages')
        ? [{ kind: 'applied', id: MSG_ID, server_version: '46', current: null }]
        : [],
    );

    const res = await POST(
      makePost({
        protocolVersion: 2,
        messages: [
          {
            id: MSG_ID,
            conversationId: CONV_ID,
            role: 'user',
            content: 'hello',
            baseVersion: '0',
            parentId: '018f6f2a-0000-7000-8000-00000000000a',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const [leafSql] = mockQuery.mock.calls[0] as [string];
    expect(leafSql).toContain('active_leaf_message_id');
    const mutation = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('insert into web_messages'),
    ) as [string, unknown[]];
    expect(mutation[1][1]).not.toContain('parentId');
    expect(mutation[1][2]).toBe('[]');
  });

  it('carries both branch pointers on the conflict rows a client resolves against', async () => {
    const PARENT_ID = '018f6f2a-0000-7000-8000-00000000000a';
    const LEAF_ID = '018f6f2a-0000-7000-8000-00000000000b';
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('insert into web_conversations')) {
        return [
          {
            kind: 'conflict',
            id: CONV_ID,
            server_version: null,
            current: { ...conversationRow, active_leaf_message_id: LEAF_ID },
          },
        ];
      }
      if (String(sql).includes('insert into web_messages')) {
        return [
          {
            kind: 'conflict',
            id: MSG_ID,
            server_version: null,
            current: { ...messageRow, parent_id: PARENT_ID },
          },
        ];
      }
      return [];
    });

    const res = await POST(
      makePost({
        protocolVersion: 2,
        conversations: [{ id: CONV_ID, title: 'stale', baseVersion: '41' }],
        messages: [
          {
            id: MSG_ID,
            conversationId: CONV_ID,
            role: 'assistant',
            content: 'stale content',
            baseVersion: '42',
          },
        ],
      }),
    );
    const body = await res.json();

    const conversationSql = String(
      mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('insert into web_conversations'),
      )?.[0],
    );
    const messageSql = String(
      mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('insert into web_messages'),
      )?.[0],
    );
    expect(conversationSql).toContain(
      "'active_leaf_message_id', current.active_leaf_message_id::text",
    );
    expect(messageSql).toContain("'parent_id', current.parent_id::text");
    expect(body.conflicts.conversations[0].current.active_leaf_message_id).toBe(LEAF_ID);
    expect(body.conflicts.messages[0].current.parent_id).toBe(PARENT_ID);
    expect(ChatSyncPushResponseSchema.safeParse(body).success).toBe(true);
  });

  it('explicitly rejects a legacy mutable push instead of comparing client clocks', async () => {
    const res = await POST(
      makePost({
        conversations: [{ id: CONV_ID, title: 'stale', updatedAt: '2999-01-01T00:00:00.000Z' }],
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ requiredProtocolVersion: 2 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects duplicate entity ids before querying', async () => {
    const res = await POST(
      makePost({
        protocolVersion: 2,
        conversations: [
          { id: CONV_ID, title: 'one', baseVersion: '0' },
          { id: CONV_ID, title: 'two', baseVersion: '0' },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('empty push ack parses', async () => {
    const res = await POST(makePost({}));
    expect(ChatSyncPushResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});
