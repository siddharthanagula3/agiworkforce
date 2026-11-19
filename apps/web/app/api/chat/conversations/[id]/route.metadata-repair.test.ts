import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), warn: vi.fn() }));

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
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn },
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

const { GET } = await import('./route');

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

const conversationRow = {
  id: CONVERSATION_ID,
  organization_id: ORGANIZATION_ID,
  title: 'Trip plan',
  model: null,
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  active_leaf_message_id: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  server_version: '7',
};

function messageRow(index: number, metadata: unknown) {
  return {
    id: `55555555-5555-4555-8555-00000000000${index}`,
    parent_id: null,
    role: 'user',
    content: `message ${index}`,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: `2026-09-0${index}T00:00:00.000Z`,
    metadata,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
});

describe('GET /api/chat/conversations/[id] with stored metadata that is not an object', () => {
  it('opens the conversation and sends each such row repaired, warning with ids only', async () => {
    const suggestions = ['Try a smaller image', 'Use another style'];
    const rows = [
      messageRow(1, { sources: [] }),
      {
        ...messageRow(2, [null, { followUpSuggestions: suggestions }]),
        role: 'assistant',
        content: 'secret answer text',
      },
      messageRow(3, 'stop'),
      messageRow(4, null),
    ];
    mocks.query.mockImplementation(async (sql: string) => {
      if (/count\(\*\)/.test(sql)) return [{ total: String(rows.length) }];
      if (/from web_messages/.test(sql)) return rows;
      return [conversationRow];
    });

    const response = await GET(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`),
      context,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      messages: Array<{ id: string; metadata: unknown }>;
      total: number;
    };
    expect(body.total).toBe(4);
    expect(body.messages.map((message) => message.metadata)).toEqual([
      { sources: [] },
      { followUpSuggestions: suggestions },
      {},
      null,
    ]);
    expect(mocks.warn).toHaveBeenCalledTimes(2);
    expect(mocks.warn.mock.calls.map(([fields]) => fields)).toEqual([
      expect.objectContaining({
        event: 'chat_message_metadata_not_object',
        messageId: rows[1]!.id,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
      }),
      expect.objectContaining({ messageId: rows[2]!.id }),
    ]);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('secret answer text');
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('Try a smaller image');
  });
});
