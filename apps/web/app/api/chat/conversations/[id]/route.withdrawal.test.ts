import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { StatementScanPostgres, type Row } from '@/lib/services/__tests__/statement-scan-postgres';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const WITHDRAWN_ID = '22222222-2222-4222-8222-222222222222';
const KEPT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: mocks.db,
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

const { GET } = await import('./route');

function turn(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    parent_id: null,
    conversation_id: CONVERSATION_ID,
    role: 'user',
    content,
    model: 'a-model',
    provider: 'a-provider',
    input_tokens: 1,
    output_tokens: 1,
    metadata: {},
    created_at: '2026-09-18T00:00:00.000Z',
    deleted_at: deletedAt,
  };
}

function seed() {
  mocks.db = new StatementScanPostgres({
    web_conversations: [
      {
        id: CONVERSATION_ID,
        organization_id: ORGANIZATION_ID,
        user_id: USER_ID,
        title: 'A chat',
        model: 'a-model',
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        active_leaf_message_id: null,
        created_at: '2026-09-18T00:00:00.000Z',
        updated_at: '2026-09-18T00:00:00.000Z',
        server_version: '1',
        deleted_at: null,
      },
    ],
    web_messages: [
      turn(WITHDRAWN_ID, 'the sentence the user took back', '2026-09-19T00:00:00.000Z'),
      turn(KEPT_ID, 'the sentence the user kept', null),
    ],
  });
}

async function read() {
  seed();
  const response = await GET(
    new NextRequest(`https://example.invalid/api/chat/conversations/${CONVERSATION_ID}`),
    { params: Promise.resolve({ id: CONVERSATION_ID }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    messages: Array<{ id: string; content: string }>;
    total: number;
  };
}

describe('GET /api/chat/conversations/[id]', () => {
  it('serves no turn the user deleted', async () => {
    const body = await read();
    expect(body.messages.map((message) => message.content)).toEqual(['the sentence the user kept']);
  });

  it('counts only the turns it will serve, so the pager cannot run past them', async () => {
    const body = await read();
    expect(body.total).toBe(1);
  });
});
