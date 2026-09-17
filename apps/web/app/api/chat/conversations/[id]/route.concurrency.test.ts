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

function updateCall(): [string, unknown[]] | undefined {
  return (mocks.query.mock.calls as [string, unknown[]][]).find(([sql]) =>
    /update web_conversations/.test(sql),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('conversation optimistic concurrency', () => {
  it('publishes the version as an ETag without adding it to the body', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/count\(\*\)/.test(sql)) return [{ total: '0' }];
      if (/from web_messages/.test(sql)) return [];
      return [{ ...conversationRow, server_version: '42' }];
    });

    const response = await GET(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}`),
      context,
    );

    expect(response.headers.get('etag')).toBe('"42"');
    const body = (await response.json()) as { conversation: Record<string, unknown> };
    expect(body.conversation).toEqual(conversationRow);
  });

  it('updates unconditionally when no If-Match is sent', async () => {
    mocks.query.mockResolvedValue([{ ...conversationRow, server_version: '43' }]);

    const response = await PUT(put({ title: 'Mine' }), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"43"');
    expect(updateCall()?.[0]).toContain('server_version = $19::bigint');
    expect(updateCall()?.[1][18]).toBeNull();
  });

  it('applies the update only at the version the caller read', async () => {
    mocks.query.mockResolvedValue([{ ...conversationRow, server_version: '43' }]);

    const response = await PUT(put({ title: 'Mine' }, { 'If-Match': '"42"' }), context);

    expect(response.status).toBe(200);
    expect(updateCall()?.[1][18]).toBe('42');
  });

  it('refuses a stale write with 412 and the current conversation', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      /update web_conversations/.test(sql) ? [] : [{ ...conversationRow, server_version: '44' }],
    );

    const response = await PUT(put({ title: 'Mine' }, { 'If-Match': 'W/"42"' }), context);

    expect(response.status).toBe(412);
    expect(response.headers.get('etag')).toBe('"44"');
    const body = (await response.json()) as {
      error: { code: string };
      current: Record<string, unknown>;
    };
    expect(body.error.code).toBe('PRECONDITION_FAILED');
    expect(body.current).toEqual(conversationRow);
  });

  it('still answers 404 when a conditional write targets a missing conversation', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await PUT(put({ title: 'Mine' }, { 'If-Match': '"42"' }), context);

    expect(response.status).toBe(404);
  });

  it('rejects an If-Match that is not a version', async () => {
    const response = await PUT(put({ title: 'Mine' }, { 'If-Match': '"abc"' }), context);

    expect(response.status).toBe(400);
    expect(updateCall()).toBeUndefined();
  });
});
