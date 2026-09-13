import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockResolveOrgMembership } = vi.hoisted(() => ({
  mockResolveOrgMembership: vi.fn(),
}));

vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveOrgMembership: mockResolveOrgMembership,
}));

import {
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
  isConversationSharingSchemaUnavailable,
  listSharedSessions,
  resolveSessionShareTarget,
  setSharedSessionVisibility,
  shareSessionWithOrganization,
  unshareSessionFromOrganization,
} from '../org-shared-session-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return handler(sql, params);
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as never, issued };
}

function sharedRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    shared_session_id: SESSION,
    token: TOKEN,
    title: 'Pricing review',
    total_messages: 12,
    visibility: 'organization',
    owner_user_id: 'user_owner',
    shared_by_user_id: 'user_owner',
    expires_at: '2026-09-20T00:00:00.000Z',
    created_at: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION,
    token: TOKEN,
    owner_id: 'user_owner',
    title: 'Pricing review',
    model_id: null,
    provider: null,
    messages: [{ role: 'user', content: 'hi' }],
    total_messages: 12,
    visibility: 'organization',
    expires_at: '2026-09-20T00:00:00.000Z',
    created_at: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
});

describe('listSharedSessions', () => {
  it('joins the share and scopes to the organization', async () => {
    const { db, issued } = makeDb(() => [sharedRow()]);

    const rows = await listSharedSessions(db, ORG);

    expect(issued[0]?.params).toEqual([ORG]);
    expect(issued[0]?.sql).toMatch(/join public\.shared_sessions/);
    expect(rows[0]).toMatchObject({
      sharedSessionId: SESSION,
      title: 'Pricing review',
      messageCount: 12,
      visibility: 'organization',
      ownerUserId: 'user_owner',
    });
  });

  it('answers empty rather than failing where 0186 has not been applied', async () => {
    const { db } = makeDb(() => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });

    await expect(listSharedSessions(db, ORG)).resolves.toEqual([]);
  });
});

describe('shareSessionWithOrganization', () => {
  it('resolves the share row from the database, never from the request body', async () => {
    const { db, issued } = makeDb(() => [sharedRow()]);

    await shareSessionWithOrganization(db, {
      organizationId: ORG,
      sharedSessionId: SESSION,
      actorUserId: 'user_owner',
    });

    expect(issued[0]?.sql).toMatch(/insert into public\.organization_shared_sessions/);
    expect(issued[0]?.sql).toMatch(/from public\.shared_sessions session/);
    expect(issued[0]?.params).toEqual([ORG, SESSION, 'user_owner']);
  });

  it('refuses when the share the grant would name does not exist', async () => {
    const { db } = makeDb(() => []);

    await expect(
      shareSessionWithOrganization(db, {
        organizationId: ORG,
        sharedSessionId: SESSION,
        actorUserId: 'user_owner',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('unshareSessionFromOrganization', () => {
  it('reports whether a grant row was actually removed', async () => {
    const removed = makeDb(() => [{ shared_session_id: SESSION }]);
    const absent = makeDb(() => []);

    await expect(unshareSessionFromOrganization(removed.db, ORG, SESSION)).resolves.toBe(true);
    await expect(unshareSessionFromOrganization(absent.db, ORG, SESSION)).resolves.toBe(false);
    expect(removed.issued[0]?.sql).toMatch(/delete from public\.organization_shared_sessions/);
  });
});

describe('getPublicSharedSessionByToken', () => {
  it('demands a public audience in the statement, not merely in the caller', async () => {
    const { db, issued } = makeDb(() => [sessionRow({ visibility: 'public' })]);

    await getPublicSharedSessionByToken(db, TOKEN);

    expect(issued[0]?.sql).toMatch(/visibility = 'public'/);
  });

  it('falls back to the 0051 read where the column does not exist yet', async () => {
    let call = 0;
    const { db, issued } = makeDb(() => {
      call += 1;
      if (call === 1) throw Object.assign(new Error('no column'), { code: '42703' });
      return [sessionRow({ visibility: undefined })];
    });

    const session = await getPublicSharedSessionByToken(db, TOKEN);

    expect(issued).toHaveLength(2);
    expect(issued[1]?.sql).not.toMatch(/visibility/);
    expect(session?.visibility).toBe('public');
  });

  it('never issues a statement for a malformed token', async () => {
    const { db, issued } = makeDb(() => [sessionRow()]);

    await expect(getPublicSharedSessionByToken(db, 'short')).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });
});

describe('getOrgReadableSessionByToken', () => {
  /**
   * Repeating an ownership predicate here would hide whether the database is
   * enforcing the share, so the statement carries only the token and the RLS
   * policy decides.
   */
  it('adds no ownership predicate of its own', async () => {
    const { db, issued } = makeDb(() => [sessionRow()]);

    const session = await getOrgReadableSessionByToken(db, TOKEN);

    expect(issued[0]?.params).toEqual([TOKEN]);
    expect(issued[0]?.sql).not.toMatch(/owner_id\s*=/);
    expect(session).toMatchObject({ ownerUserId: 'user_owner', visibility: 'organization' });
  });
});

describe('resolveSessionShareTarget', () => {
  it('refuses a caller who belongs to no workspace, naming why', async () => {
    mockResolveOrgMembership.mockResolvedValue(null);
    const { db } = makeDb(() => []);

    await expect(
      resolveSessionShareTarget(db, { userId: 'user_owner', token: TOKEN }),
    ).rejects.toThrow(/not a member of a workspace/i);
  });

  it('resolves the share row by token and owner', async () => {
    const { db, issued } = makeDb(() => [{ id: SESSION }]);

    await expect(
      resolveSessionShareTarget(db, { userId: 'user_owner', token: TOKEN }),
    ).resolves.toEqual({ organizationId: ORG, sharedSessionId: SESSION });
    expect(issued[0]?.params).toEqual([TOKEN, 'user_owner']);
  });
});

describe('setSharedSessionVisibility', () => {
  it('changes the audience without touching the token or the expiry', async () => {
    const { db, issued } = makeDb(() => [
      { token: TOKEN, visibility: 'organization', expires_at: '2026-09-20T00:00:00.000Z' },
    ]);

    const updated = await setSharedSessionVisibility(db, {
      userId: 'user_owner',
      token: TOKEN,
      visibility: 'organization',
    });

    expect(issued[0]?.sql).toMatch(/set visibility = \$3/);
    expect(issued[0]?.sql).not.toMatch(/expires_at\s*=/);
    expect(issued[0]?.sql).not.toMatch(/token\s*=\s*\$3/);
    expect(updated).toEqual({
      token: TOKEN,
      visibility: 'organization',
      expiresAt: '2026-09-20T00:00:00.000Z',
    });
  });

  it('answers null for a malformed token without issuing a write', async () => {
    const { db, issued } = makeDb(() => []);

    await expect(
      setSharedSessionVisibility(db, { userId: 'user_owner', token: '!', visibility: 'public' }),
    ).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });
});

describe('isConversationSharingSchemaUnavailable', () => {
  it('recognises a missing table or column, including one wrapped in a cause', () => {
    expect(isConversationSharingSchemaUnavailable({ code: '42P01' })).toBe(true);
    expect(isConversationSharingSchemaUnavailable({ cause: { code: '42703' } })).toBe(true);
    expect(isConversationSharingSchemaUnavailable({ code: '23505' })).toBe(false);
    expect(isConversationSharingSchemaUnavailable(null)).toBe(false);
  });
});
