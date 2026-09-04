import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const PERSONAL_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const ORG_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  activeOrganizationId: null as string | null,
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: mocks.activeOrganizationId,
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/e2b/runtime', () => ({ killE2BSession: vi.fn(async () => undefined) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET, POST } = await import('./route');
const { PUT } = await import('./[id]/route');

const rows = [
  {
    id: PERSONAL_CONVERSATION_ID,
    organization_id: null,
    title: 'Personal conversation',
    model: null,
    project_id: null,
    pinned: false,
    starred: false,
    archived: false,
    is_temporary: false,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
  },
  {
    id: ORG_CONVERSATION_ID,
    organization_id: ORGANIZATION_ID,
    title: 'Organization conversation',
    model: null,
    project_id: null,
    pinned: false,
    starred: false,
    archived: false,
    is_temporary: false,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
  },
];

function sameScope(left: string | null, right: unknown): boolean {
  return left === right;
}

function assertOrganizationPredicate(sql: string): void {
  expect(sql).toMatch(/organization_id is not distinct from \$\d+/u);
}

function listRequest(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/chat/conversations');
}

function updateRequest(id: string): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/chat/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Mutated' }),
  });
}

describe('conversation active-organization isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeOrganizationId = null;
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockImplementation(async (sqlValue: unknown, paramsValue: unknown) => {
      const sql = String(sqlValue);
      const params = paramsValue as unknown[];

      if (/select[\s\S]+from web_conversations[\s\S]+order by pinned/u.test(sql)) {
        assertOrganizationPredicate(sql);
        return rows.filter((row) => sameScope(row.organization_id, params[1]));
      }

      if (/update web_conversations/u.test(sql)) {
        assertOrganizationPredicate(sql);
        const row = rows.find(
          (candidate) =>
            candidate.id === params[0] && sameScope(candidate.organization_id, params[14]),
        );
        return row ? [{ ...row, title: String(params[2]) }] : [];
      }

      if (/insert into web_conversations/u.test(sql)) {
        assertOrganizationPredicate(sql);
        return [
          {
            id: CREATED_CONVERSATION_ID,
            organization_id: params[6],
            title: params[1],
            model: params[2],
            project_id: params[3],
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: params[5],
            created_at: '2026-08-11T00:00:00.000Z',
            updated_at: '2026-08-11T00:00:00.000Z',
          },
        ];
      }

      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('keeps Personal reads and mutations out of the active organization', async () => {
    const listResponse = await GET(listRequest());
    const listBody = (await listResponse.json()) as { conversations: Array<{ id: string }> };
    expect(listBody.conversations.map(({ id }) => id)).toEqual([PERSONAL_CONVERSATION_ID]);

    const updateResponse = await PUT(updateRequest(ORG_CONVERSATION_ID), {
      params: Promise.resolve({ id: ORG_CONVERSATION_ID }),
    });
    expect(updateResponse.status).toBe(404);
  });

  it('keeps organization reads and mutations out of Personal', async () => {
    mocks.activeOrganizationId = ORGANIZATION_ID;

    const listResponse = await GET(listRequest());
    const listBody = (await listResponse.json()) as { conversations: Array<{ id: string }> };
    expect(listBody.conversations.map(({ id }) => id)).toEqual([ORG_CONVERSATION_ID]);

    const updateResponse = await PUT(updateRequest(PERSONAL_CONVERSATION_ID), {
      params: Promise.resolve({ id: PERSONAL_CONVERSATION_ID }),
    });
    expect(updateResponse.status).toBe(404);
  });

  it('persists the active organization and keeps idempotent conflicts in that scope', async () => {
    mocks.activeOrganizationId = ORGANIZATION_ID;

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'Organization draft' }),
      }),
    );

    expect(response.status).toBe(201);
    const [sql, params] = mocks.query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('(id, user_id, organization_id, title, model, project_id, is_temporary)');
    expect(sql).toContain('web_conversations.organization_id is not distinct from $7');
    expect(sql).toContain('returning id, organization_id');
    expect(sql).not.toMatch(/set[\s\S]*organization_id\s*=/u);
    expect(params[6]).toBe(ORGANIZATION_ID);
    await expect(response.json()).resolves.toMatchObject({
      conversation: { organization_id: ORGANIZATION_ID },
    });
  });
});
