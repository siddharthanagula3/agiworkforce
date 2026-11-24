import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/tier-unit-quota-service');

const PERSONAL_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const ORG_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

const { mockAssertFreeDailyAllowance } = vi.hoisted(() => ({
  mockAssertFreeDailyAllowance: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertFreeDailyAllowance: mockAssertFreeDailyAllowance,
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

      if (/select[\s\S]+from web_conversations[\s\S]+order by page_sort_key/u.test(sql)) {
        assertOrganizationPredicate(sql);
        return rows.filter((row) => sameScope(row.organization_id, params[1]));
      }

      if (/from user_projects/u.test(sql)) {
        assertOrganizationPredicate(sql);
        expect(params).toEqual([PROJECT_ID, 'user-1', mocks.activeOrganizationId]);
        return mocks.activeOrganizationId === ORGANIZATION_ID ? [{ id: PROJECT_ID }] : [];
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

  it('refuses a project from another workspace before creating or moving a conversation', async () => {
    const create = await POST(
      new NextRequest('https://agiworkforce.com/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    );
    expect(create.status).toBe(404);
    const move = await PUT(
      new NextRequest(
        `https://agiworkforce.com/api/chat/conversations/${PERSONAL_CONVERSATION_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ projectId: PROJECT_ID }),
        },
      ),
      { params: Promise.resolve({ id: PERSONAL_CONVERSATION_ID }) },
    );
    expect(move.status).toBe(404);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        /insert into web_conversations|update web_conversations/u.test(String(sql)),
      ),
    ).toBe(false);
  });

  it('creates a conversation with a project only in the explicitly selected workspace', async () => {
    mocks.activeOrganizationId = ORGANIZATION_ID;
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT_ID }),
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).conversation).toMatchObject({
      project_id: PROJECT_ID,
      organization_id: ORGANIZATION_ID,
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
    expect(sql).toContain(
      '(id, user_id, organization_id, title, model, project_id, is_temporary, selected_route_id)',
    );
    expect(sql).toContain('web_conversations.organization_id is not distinct from $7');
    expect(sql).toContain('returning id, organization_id');
    expect(sql).not.toMatch(/set[\s\S]*organization_id\s*=/u);
    expect(params[6]).toBe(ORGANIZATION_ID);
    await expect(response.json()).resolves.toMatchObject({
      conversation: { organization_id: ORGANIZATION_ID },
    });
  });
});

describe('shared project chats', () => {
  const OWNER_ID = 'user-2';
  const SHARED_PROJECT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let sharedGrantActive: boolean;
  let sharedProjectArchived: boolean;
  const projectLookups: Array<{ sql: string; params: unknown[] }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    projectLookups.length = 0;
    sharedGrantActive = true;
    sharedProjectArchived = false;
    mocks.activeOrganizationId = ORGANIZATION_ID;
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockImplementation(async (sqlValue: unknown, paramsValue: unknown) => {
      const sql = String(sqlValue);
      const params = paramsValue as unknown[];
      if (/from user_projects/u.test(sql)) {
        projectLookups.push({ sql, params });
        const admitsShare = /organization_shared_projects/u.test(sql);
        const archivedBlocked = /is_archived = false/u.test(sql);
        const visible =
          params[0] === SHARED_PROJECT_ID &&
          params[1] !== OWNER_ID &&
          params[2] === ORGANIZATION_ID &&
          sharedGrantActive &&
          admitsShare &&
          !(sharedProjectArchived && archivedBlocked);
        return visible ? [{ id: SHARED_PROJECT_ID }] : [];
      }
      if (/update web_conversations/u.test(sql)) {
        return [{ ...rows[1], project_id: SHARED_PROJECT_ID, title: String(params[2]) }];
      }
      if (/insert into web_conversations/u.test(sql)) {
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

  function createInShared(): Promise<Response> {
    return POST(
      new NextRequest('https://agiworkforce.com/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ projectId: SHARED_PROJECT_ID }),
      }),
    );
  }

  function moveIntoShared(): Promise<Response> {
    return PUT(
      new NextRequest(`https://agiworkforce.com/api/chat/conversations/${ORG_CONVERSATION_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ projectId: SHARED_PROJECT_ID }),
      }),
      { params: Promise.resolve({ id: ORG_CONVERSATION_ID }) },
    );
  }

  it('lets a member with a shared grant start a private chat in the project', async () => {
    const response = await createInShared();
    expect(response.status).toBe(201);
    expect((await response.json()).conversation).toMatchObject({
      project_id: SHARED_PROJECT_ID,
      organization_id: ORGANIZATION_ID,
    });
    const insert = mocks.query.mock.calls.find(([sql]) =>
      /insert into web_conversations/u.test(String(sql)),
    ) as [string, unknown[]];
    expect(insert[1][0]).toBe('user-1');
    expect(insert[1][3]).toBe(SHARED_PROJECT_ID);
    expect(insert[1][6]).toBe(ORGANIZATION_ID);
  });

  it('refuses a project that is not shared with the member', async () => {
    sharedGrantActive = false;
    const response = await createInShared();
    expect(response.status).toBe(404);
    expect(
      mocks.query.mock.calls.some(([sql]) => /insert into web_conversations/u.test(String(sql))),
    ).toBe(false);
  });

  it('refuses a shared project when another workspace is active', async () => {
    mocks.activeOrganizationId = '99999999-9999-4999-8999-999999999999';
    const response = await createInShared();
    expect(response.status).toBe(404);
  });

  it('refuses a new chat in an archived shared project', async () => {
    sharedProjectArchived = true;
    const response = await createInShared();
    expect(response.status).toBe(404);
    expect(projectLookups[0]?.sql).toMatch(/is_archived = false/u);
  });

  it('moves the member own chat into a shared project and refuses an unshared one', async () => {
    const moved = await moveIntoShared();
    expect(moved.status).toBe(200);
    sharedGrantActive = false;
    const refused = await moveIntoShared();
    expect(refused.status).toBe(404);
  });
});

describe('owner project chats keep their exact workspace rule', () => {
  const OWN_PROJECT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let ownProjectOrganizationId: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    ownProjectOrganizationId = null;
    mocks.activeOrganizationId = null;
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockImplementation(async (sqlValue: unknown, paramsValue: unknown) => {
      const sql = String(sqlValue).replace(/\s+/gu, ' ');
      const params = paramsValue as unknown[];
      if (/from user_projects/u.test(sql)) {
        const ownerBranch = sql.includes(
          '(p.user_id = $2 and p.organization_id is not distinct from $3::uuid)',
        );
        const visible =
          ownerBranch &&
          params[0] === OWN_PROJECT_ID &&
          params[1] === 'user-1' &&
          ownProjectOrganizationId === params[2];
        return visible ? [{ id: OWN_PROJECT_ID }] : [];
      }
      if (/update web_conversations/u.test(sql)) {
        return [{ ...rows[0], project_id: OWN_PROJECT_ID, title: String(params[2]) }];
      }
      if (/insert into web_conversations/u.test(sql)) {
        return [{ ...rows[0], id: CREATED_CONVERSATION_ID, project_id: params[3] }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  function createInOwn(): Promise<Response> {
    return POST(
      new NextRequest('https://agiworkforce.com/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ projectId: OWN_PROJECT_ID }),
      }),
    );
  }

  function moveIntoOwn(): Promise<Response> {
    return PUT(
      new NextRequest(
        `https://agiworkforce.com/api/chat/conversations/${PERSONAL_CONVERSATION_ID}`,
        { method: 'PUT', body: JSON.stringify({ projectId: OWN_PROJECT_ID }) },
      ),
      { params: Promise.resolve({ id: PERSONAL_CONVERSATION_ID }) },
    );
  }

  it('lets the owner chat in a personal project from the personal context', async () => {
    expect((await createInOwn()).status).toBe(201);
    expect((await moveIntoOwn()).status).toBe(200);
  });

  it('lets the owner chat in their organization project from that workspace', async () => {
    ownProjectOrganizationId = ORGANIZATION_ID;
    mocks.activeOrganizationId = ORGANIZATION_ID;
    expect((await createInOwn()).status).toBe(201);
  });

  it('still refuses the owner a project that belongs to another workspace', async () => {
    ownProjectOrganizationId = ORGANIZATION_ID;
    expect((await createInOwn()).status).toBe(404);
    ownProjectOrganizationId = null;
    mocks.activeOrganizationId = ORGANIZATION_ID;
    expect((await createInOwn()).status).toBe(404);
  });
});
