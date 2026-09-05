import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const LEAF_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
  })),
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
vi.mock('@/lib/e2b/runtime', () => ({ killE2BSession: vi.fn() }));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudE2BSessionScope: vi.fn(() => 'scope'),
  CHAT_SANDBOX_NETWORK_ACCESS: 'trusted',
  deleteE2BSession: vi.fn(),
  getE2BSession: vi.fn(),
  saveE2BSession: vi.fn(),
  withUserSandboxLock: vi.fn(async (_scope: unknown, critical: () => Promise<unknown>) => ({
    locked: true,
    result: await critical(),
  })),
}));
vi.mock('@/lib/services/published-artifact-service', () => ({
  unpublishArtifactsForConversations: vi.fn(async () => []),
}));

const { GET, PUT } = await import('./route');

const CONVERSATION_SELECT = /from web_conversations/;
const MESSAGE_SELECT = /from web_messages/;
const MESSAGE_COUNT = /count\(\*\)::text as total/;
const LEAF_CHECK = /join web_conversations conversation/;
const CONVERSATION_UPDATE = /update web_conversations/;

type Responder = { match: RegExp; rows: unknown[] };

function givenDatabase(responders: Responder[]) {
  mocks.query.mockImplementation(async (sql: string) => {
    const responder = responders.find((candidate) => candidate.match.test(sql));
    return responder ? responder.rows : [];
  });
  mocks.execute.mockResolvedValue(1);
}

function statementMatching(pattern: RegExp): [string, unknown[]?] | undefined {
  return (mocks.query.mock.calls as [string, unknown[]?][]).find(([sql]) => pattern.test(sql));
}

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

const legacyConversation = {
  id: CONVERSATION_ID,
  organization_id: ORGANIZATION_ID,
  title: 'Untouched',
  model: null,
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  active_leaf_message_id: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
};

const legacyMessage = {
  id: MESSAGE_ID,
  parent_id: null,
  role: 'user',
  content: 'hello',
  model: null,
  provider: null,
  input_tokens: 0,
  output_tokens: 0,
  created_at: '2026-08-01T00:00:00.000Z',
  metadata: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/chat/conversations/[id], thread columns', () => {
  it('reads the tree alongside the transcript it has always read', async () => {
    givenDatabase([
      { match: MESSAGE_COUNT, rows: [{ total: '1' }] },
      { match: CONVERSATION_SELECT, rows: [legacyConversation] },
      { match: MESSAGE_SELECT, rows: [legacyMessage] },
    ]);

    await GET(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`),
      context,
    );

    expect(statementMatching(CONVERSATION_SELECT)?.[0]).toContain('active_leaf_message_id');
    expect(statementMatching(MESSAGE_SELECT)?.[0]).toContain('parent_id');
    expect(statementMatching(MESSAGE_SELECT)?.[0]).toContain('order by created_at asc');
  });

  it('answers for a conversation that predates variants with nulls and nothing else new', async () => {
    givenDatabase([
      { match: MESSAGE_COUNT, rows: [{ total: '1' }] },
      { match: CONVERSATION_SELECT, rows: [legacyConversation] },
      { match: MESSAGE_SELECT, rows: [legacyMessage] },
    ]);

    const response = await GET(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`),
      context,
    );
    const body = (await response.json()) as {
      conversation: Record<string, unknown>;
      messages: Record<string, unknown>[];
      total: number;
      hasMore: boolean;
    };

    expect(Object.keys(body).sort()).toEqual(['conversation', 'hasMore', 'messages', 'total']);
    expect(body.conversation).toEqual(legacyConversation);
    expect(body.messages).toEqual([legacyMessage]);
    expect(body.conversation['active_leaf_message_id']).toBeNull();
    expect(body.messages[0]?.['parent_id']).toBeNull();
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
  });
});

describe('PUT /api/chat/conversations/[id], active leaf', () => {
  function putLeaf(body: unknown): NextRequest {
    return new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('persists a leaf that belongs to the conversation', async () => {
    givenDatabase([
      { match: LEAF_CHECK, rows: [{ id: LEAF_ID }] },
      {
        match: CONVERSATION_UPDATE,
        rows: [{ ...legacyConversation, active_leaf_message_id: LEAF_ID }],
      },
    ]);

    const response = await PUT(putLeaf({ activeLeafMessageId: LEAF_ID }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: { active_leaf_message_id: LEAF_ID },
    });

    const update = statementMatching(CONVERSATION_UPDATE);
    expect(update?.[0]).toContain('active_leaf_message_id = case when $16::boolean');
    expect(update?.[0]).toContain('returning');
    expect(update?.[1]?.[15]).toBe(true);
    expect(update?.[1]?.[16]).toBe(LEAF_ID);
  });

  it('scopes the leaf check to the caller, so it cannot probe another account thread', async () => {
    givenDatabase([
      { match: LEAF_CHECK, rows: [{ id: LEAF_ID }] },
      { match: CONVERSATION_UPDATE, rows: [legacyConversation] },
    ]);

    await PUT(putLeaf({ activeLeafMessageId: LEAF_ID }), context);

    const check = statementMatching(LEAF_CHECK);
    expect(check?.[0]).toContain('conversation.user_id = $3');
    expect(check?.[0]).toContain('conversation.organization_id is not distinct from $4');
    expect(check?.[1]).toEqual([LEAF_ID, CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
  });

  it('refuses a leaf that is not a message in this conversation', async () => {
    givenDatabase([{ match: CONVERSATION_UPDATE, rows: [legacyConversation] }]);

    const response = await PUT(putLeaf({ activeLeafMessageId: LEAF_ID }), context);

    expect(response.status).toBe(404);
    expect(statementMatching(CONVERSATION_UPDATE)).toBeUndefined();
  });

  it('leaves the timestamp alone when the only change is which variant is being read', async () => {
    givenDatabase([
      { match: LEAF_CHECK, rows: [{ id: LEAF_ID }] },
      { match: CONVERSATION_UPDATE, rows: [legacyConversation] },
    ]);

    await PUT(putLeaf({ activeLeafMessageId: LEAF_ID }), context);
    expect(statementMatching(CONVERSATION_UPDATE)?.[1]?.[17]).toBe(true);

    vi.clearAllMocks();
    givenDatabase([
      { match: LEAF_CHECK, rows: [{ id: LEAF_ID }] },
      { match: CONVERSATION_UPDATE, rows: [legacyConversation] },
    ]);

    await PUT(putLeaf({ activeLeafMessageId: LEAF_ID, pinned: true }), context);
    expect(statementMatching(CONVERSATION_UPDATE)?.[1]?.[17]).toBe(false);
  });

  it('does not look a leaf up when the request never mentions one', async () => {
    givenDatabase([{ match: CONVERSATION_UPDATE, rows: [legacyConversation] }]);

    const response = await PUT(putLeaf({ pinned: true }), context);

    expect(response.status).toBe(200);
    expect(statementMatching(LEAF_CHECK)).toBeUndefined();
    expect(statementMatching(CONVERSATION_UPDATE)?.[1]?.[15]).toBe(false);
    expect(statementMatching(CONVERSATION_UPDATE)?.[1]?.[17]).toBe(false);
  });

  it('returns a conversation to its linear reading when the leaf is explicitly null', async () => {
    givenDatabase([{ match: CONVERSATION_UPDATE, rows: [legacyConversation] }]);

    const response = await PUT(putLeaf({ activeLeafMessageId: null }), context);

    expect(response.status).toBe(200);
    const update = statementMatching(CONVERSATION_UPDATE);
    expect(update?.[1]?.[15]).toBe(true);
    expect(update?.[1]?.[16]).toBeNull();
  });

  it('looks up no message for a null leaf, so the reset cannot 404 on its own emptiness', async () => {
    givenDatabase([{ match: CONVERSATION_UPDATE, rows: [legacyConversation] }]);

    const response = await PUT(putLeaf({ activeLeafMessageId: null }), context);

    expect(response.status).toBe(200);
    expect(statementMatching(LEAF_CHECK)).toBeUndefined();
  });

  it('still refuses a leaf that is not a uuid at all', async () => {
    givenDatabase([{ match: CONVERSATION_UPDATE, rows: [legacyConversation] }]);

    const response = await PUT(putLeaf({ activeLeafMessageId: 'not-a-uuid' }), context);

    expect(response.status).toBe(400);
    expect(statementMatching(CONVERSATION_UPDATE)).toBeUndefined();
  });
});
