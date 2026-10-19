import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
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

const conversationRow = {
  id: CONVERSATION_ID,
  organization_id: ORGANIZATION_ID,
  title: 'Renamed elsewhere',
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

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function put(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('instructions for one conversation', () => {
  it('writes the trimmed text on its own statement and returns it with the conversation', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/set instructions = /.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/update web_conversations/.test(sql)) {
        return [
          {
            ...conversationRow,
            instructions: 'Answer in Spanish.',
            server_version: '4',
          },
        ];
      }
      return [];
    });

    const response = await PUT(put({ instructions: '  Answer in Spanish.  ' }), context);

    expect(response.status).toBe(200);
    const write = (mocks.query.mock.calls as [string, unknown[]][]).find(([sql]) =>
      /set instructions = nullif\(btrim\(\$3::text\), ''\)/.test(sql),
    );
    expect(write?.[1]).toEqual([
      CONVERSATION_ID,
      USER_ID,
      '  Answer in Spanish.  ',
      ORGANIZATION_ID,
    ]);
    const body = (await response.json()) as { conversation: { instructions?: string } };
    expect(body.conversation.instructions).toBe('Answer in Spanish.');
  });

  it('refuses instructions longer than the conversation allows', async () => {
    const response = await PUT(put({ instructions: 'x'.repeat(4_001) }), context);
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('reads the instructions back with the conversation', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/select id, organization_id, title/.test(sql)) {
        return [{ ...conversationRow, instructions: 'Answer in Spanish.', server_version: '4' }];
      }
      if (/count\(\*\)/.test(sql)) return [{ total: '0' }];
      return [];
    });

    const response = await GET(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`),
      context,
    );

    const body = (await response.json()) as { conversation: { instructions?: string } };
    expect(body.conversation.instructions).toBe('Answer in Spanish.');
    const read = (mocks.query.mock.calls as [string, unknown[]][]).find(([sql]) =>
      /select id, organization_id, title/.test(sql),
    );
    expect(read?.[0]).toMatch(/draft_updated_at, instructions,/);
  });
});
