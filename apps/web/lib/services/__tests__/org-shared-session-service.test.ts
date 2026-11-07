import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const { mockResolveOrgMembership } = vi.hoisted(() => ({
  mockResolveOrgMembership: vi.fn(),
}));

vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveOrgMembership: mockResolveOrgMembership,
}));

import {
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
  listSharedSessions,
  resolveSessionShareTarget,
  setSharedSessionVisibility,
  shareSessionWithOrganization,
  unshareSessionFromOrganization,
  updateSharedSessionAudience,
} from '../org-shared-session-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CAPTURED_ORG = '22222222-2222-4222-8222-222222222222';
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

  it('surfaces a missing sharing table instead of listing nothing', async () => {
    const { db } = makeDb(() => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });

    await expect(listSharedSessions(db, ORG)).rejects.toMatchObject({ code: '42P01' });
  });
});

describe('shareSessionWithOrganization', () => {
  it.each([
    { label: 'wrong organization', rows: [sharedRow({ organization_id: CAPTURED_ORG })] },
    { label: 'wrong session', rows: [sharedRow({ shared_session_id: 'other-session' })] },
    { label: 'wrong actor', rows: [sharedRow({ shared_by_user_id: 'other-user' })] },
    { label: 'wrong owner', rows: [sharedRow({ owner_user_id: 'other-user' })] },
    { label: 'missing identity', rows: [{}] },
    { label: 'multiple', rows: [sharedRow(), sharedRow()] },
  ])('rejects a $label grant receipt', async ({ rows }) => {
    const { db, issued } = makeDb(() => rows);
    await expect(
      shareSessionWithOrganization(db, {
        organizationId: ORG,
        sharedSessionId: SESSION,
        actorUserId: 'user_owner',
      }),
    ).rejects.toThrow();
    expect(issued).toHaveLength(1);
  });

  it('accepts a matching grant while the session is still public', async () => {
    const { db } = makeDb(() => [sharedRow({ visibility: 'public' })]);
    await expect(
      shareSessionWithOrganization(db, {
        organizationId: ORG,
        sharedSessionId: SESSION,
        actorUserId: 'user_owner',
      }),
    ).resolves.toMatchObject({ visibility: 'public', sharedSessionId: SESSION });
  });

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

  it.each([
    { label: 'zero', rows: [], removed: false },
    { label: 'mismatched', rows: [{ shared_session_id: 'another-session' }], removed: false },
    {
      label: 'multiple',
      rows: [{ shared_session_id: SESSION }, { shared_session_id: SESSION }],
      removed: false,
    },
    { label: 'exact', rows: [{ shared_session_id: SESSION }], removed: true },
  ])('requires an exact single delete receipt: $label', async ({ rows, removed }) => {
    const { db, issued } = makeDb(() => rows);

    await expect(unshareSessionFromOrganization(db, CAPTURED_ORG, SESSION)).resolves.toBe(removed);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.params).toEqual([CAPTURED_ORG, SESSION]);
    expect(issued[0]?.sql).toMatch(/where organization_id = \$1\s+and shared_session_id = \$2/);
    expect(issued[0]?.sql).toMatch(/returning shared_session_id/);
  });

  it('propagates delete failures without another attempt', async () => {
    const error = new Error('delete denied');
    const { db, issued } = makeDb(() => {
      throw error;
    });

    await expect(unshareSessionFromOrganization(db, ORG, SESSION)).rejects.toBe(error);
    expect(issued).toHaveLength(1);
  });
});

describe('getPublicSharedSessionByToken', () => {
  it('demands a public audience in the statement, not merely in the caller', async () => {
    const { db, issued } = makeDb(() => [sessionRow({ visibility: 'public' })]);

    await getPublicSharedSessionByToken(db, TOKEN);

    expect(issued[0]?.sql).toMatch(/visibility = 'public'/);
  });

  it('never retries without the audience filter when the read fails', async () => {
    const { db, issued } = makeDb(() => {
      throw Object.assign(new Error('no column'), { code: '42703' });
    });

    await expect(getPublicSharedSessionByToken(db, TOKEN)).rejects.toMatchObject({
      code: '42703',
    });
    expect(issued).toHaveLength(1);
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

    const session = await getOrgReadableSessionByToken(db, TOKEN, 'user_owner');

    expect(issued[0]?.params).toEqual([TOKEN]);
    expect(issued[0]?.sql).not.toMatch(/owner_id\s*=/);
    expect(session).toMatchObject({ ownerUserId: 'user_owner', visibility: 'organization' });
  });
});

describe('resolveSessionShareTarget', () => {
  it('refuses Personal without querying membership or the token', async () => {
    const { db, issued } = makeDb(() => {
      throw new Error('Unexpected database query');
    });

    await expect(
      resolveSessionShareTarget(db, { userId: 'user_owner', token: TOKEN, organizationId: null }),
    ).rejects.toThrow(/not a member of a workspace/i);
    expect(issued).toHaveLength(0);
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });

  it('uses captured B with real exact membership while saved membership points to A', async () => {
    const { db, issued } = makeDb((sql) => {
      if (sql.includes('from public.organization_members')) {
        return [{ organization_id: CAPTURED_ORG, role: 'member' }];
      }
      if (sql.includes('from public.shared_sessions')) return [{ id: SESSION }];
      throw new Error('Unexpected database query');
    });

    await expect(
      resolveSessionShareTarget(db, {
        userId: 'user_owner',
        token: TOKEN,
        organizationId: CAPTURED_ORG,
      }),
    ).resolves.toEqual({ organizationId: CAPTURED_ORG, sharedSessionId: SESSION });
    expect(issued).toHaveLength(2);
    expect(issued[0]?.params).toEqual([CAPTURED_ORG, 'user_owner']);
    expect(issued[0]?.sql).toMatch(/organization_id = \$1 and user_id = \$2/);
    expect(issued[0]?.sql).toMatch(/status = 'active'/);
    expect(issued[1]?.params).toEqual([TOKEN, 'user_owner']);
    expect(issued[1]?.sql).toMatch(/where token = \$1 and owner_id = \$2/);
    expect(issued.every(({ sql }) => !/user_settings|activeOrganizationId/.test(sql))).toBe(true);
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing', rows: [] },
    { label: 'mismatched', rows: [{ organization_id: ORG, role: 'owner' }] },
  ])('refuses $label exact membership before reading the token', async ({ rows }) => {
    const { db, issued } = makeDb(() => rows);

    await expect(
      resolveSessionShareTarget(db, {
        userId: 'user_owner',
        token: TOKEN,
        organizationId: CAPTURED_ORG,
      }),
    ).rejects.toThrow(/not a member of a workspace/i);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.sql).toMatch(/from public\.organization_members/);
    expect(issued[0]?.params).toEqual([CAPTURED_ORG, 'user_owner']);
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });

  it('propagates exact membership errors without falling back to saved selection', async () => {
    const error = new Error('membership lookup failed');
    const { db, issued } = makeDb(() => {
      throw error;
    });

    await expect(
      resolveSessionShareTarget(db, {
        userId: 'user_owner',
        token: TOKEN,
        organizationId: CAPTURED_ORG,
      }),
    ).rejects.toBe(error);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.sql).toMatch(/from public\.organization_members/);
    expect(issued[0]?.params).toEqual([CAPTURED_ORG, 'user_owner']);
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing', sessions: [] },
    { label: 'foreign-owned', sessions: [{ id: SESSION, token: TOKEN, owner_id: 'another-user' }] },
  ])('refuses a $label owned token using the SQL owner binding', async ({ sessions }) => {
    const { db, issued } = makeDb((sql, params) => {
      if (sql.includes('from public.organization_members')) {
        return [{ organization_id: CAPTURED_ORG, role: 'member' }];
      }
      if (sql.includes('from public.shared_sessions')) {
        expect(sql).toMatch(/where token = \$1 and owner_id = \$2/);
        return sessions.filter(
          (session) => session.token === params[0] && session.owner_id === params[1],
        );
      }
      throw new Error('Unexpected database query');
    });

    await expect(
      resolveSessionShareTarget(db, {
        userId: 'user_owner',
        token: TOKEN,
        organizationId: CAPTURED_ORG,
      }),
    ).rejects.toThrow(/not found/i);
    expect(issued).toHaveLength(2);
    expect(issued[1]?.params).toEqual([TOKEN, 'user_owner']);
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });
});

describe('setSharedSessionVisibility', () => {
  it('changes the audience without touching the token or the expiry', async () => {
    const { db, issued } = makeDb(() => [sessionRow()]);

    const updated = await setSharedSessionVisibility(db, {
      userId: 'user_owner',
      token: TOKEN,
      sharedSessionId: SESSION,
      visibility: 'organization',
    });

    expect(issued[0]?.sql).toMatch(/set visibility = \$3/);
    expect(issued[0]?.sql).toMatch(/where token = \$1 and owner_id = \$2 and id = \$4/);
    expect(issued[0]?.sql).toMatch(/returning id, token, owner_id, visibility, expires_at/);
    expect(issued[0]?.params).toEqual([TOKEN, 'user_owner', 'organization', SESSION]);
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
      setSharedSessionVisibility(db, {
        userId: 'user_owner', token: '!', sharedSessionId: SESSION, visibility: 'public',
      }),
    ).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });

  it('returns null for an empty update receipt', async () => {
    const { db, issued } = makeDb(() => []);
    await expect(setSharedSessionVisibility(db, {
      userId: 'user_owner', token: TOKEN, sharedSessionId: SESSION, visibility: 'public',
    })).resolves.toBeNull();
    expect(issued).toHaveLength(1);
  });

  it.each([
    { label: 'wrong id', rows: [sessionRow({ id: 'other-session', visibility: 'public' })] },
    { label: 'wrong token', rows: [sessionRow({ token: 'BBBBBBBBBBBBBBBBBBBBBBBB', visibility: 'public' })] },
    { label: 'wrong owner', rows: [sessionRow({ owner_id: 'other-user', visibility: 'public' })] },
    { label: 'unknown raw visibility', rows: [sessionRow({ visibility: 'unknown' })] },
    { label: 'missing raw visibility', rows: [sessionRow({ visibility: undefined })] },
    { label: 'wrong visibility', rows: [sessionRow()] },
    { label: 'missing identity', rows: [{ visibility: 'public' }] },
    { label: 'multiple', rows: [sessionRow({ visibility: 'public' }), sessionRow({ visibility: 'public' })] },
  ])('rejects $label before normalization can report success', async ({ rows }) => {
    const { db, issued } = makeDb(() => rows);
    await expect(setSharedSessionVisibility(db, {
      userId: 'user_owner', token: TOKEN, sharedSessionId: SESSION, visibility: 'public',
    })).rejects.toThrow();
    expect(issued).toHaveLength(1);
  });
});

type Audience = 'public' | 'organization';
type Mutation = 'grant' | 'delete' | 'update';
interface AudienceState {
  grant: string | null;
  visibility: Audience;
}
interface TransactionModelOptions {
  receipts?: Partial<Record<Mutation, unknown[]>>;
  failAt?: Mutation;
  rejectAcknowledgement?: boolean;
  beforeAcknowledgement?: () => Promise<void>;
}

// UNRUN source fixtures. This model exercises real service control flow against
// staged mock writes, not PostgreSQL SQL, RLS, rollback, or concurrency guarantees.
function makeAudienceTransactionModel(
  initial: AudienceState,
  options: TransactionModelOptions = {},
) {
  let committed = { ...initial };
  let staged = { ...initial };
  const issued: Issued[] = [];
  const events: string[] = [];
  const stagedStates: AudienceState[] = [];
  const failure = new Error('modeled database failure');
  const forbidden = vi.fn(() => {
    throw new Error('Unexpected outside write, scope rebind, or nested transaction');
  });
  const tx = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      let mutation: Mutation;
      let receipt: unknown[];
      if (sql.includes('insert into public.organization_shared_sessions')) {
        mutation = 'grant';
        expect(params).toEqual([CAPTURED_ORG, SESSION, 'user_owner']);
        receipt = [sharedRow({ organization_id: CAPTURED_ORG, visibility: staged.visibility })];
      } else if (sql.includes('delete from public.organization_shared_sessions')) {
        mutation = 'delete';
        expect(params).toEqual([ORG, SESSION]);
        receipt = staged.grant === ORG ? [{ shared_session_id: SESSION }] : [];
      } else if (sql.includes('update public.shared_sessions')) {
        mutation = 'update';
        expect(sql).toMatch(/where token = \$1 and owner_id = \$2 and id = \$4/);
        expect(params).toEqual([TOKEN, 'user_owner', params[2], SESSION]);
        expect(['public', 'organization']).toContain(params[2]);
        receipt = [sessionRow({ visibility: params[2] })];
      } else {
        throw new Error(`Unexpected statement in transaction model: ${sql}`);
      }
      events.push(mutation);
      if (options.failAt === mutation) throw failure;
      if (mutation === 'grant') staged.grant = CAPTURED_ORG;
      if (mutation === 'delete') staged.grant = null;
      if (mutation === 'update') staged.visibility = params[2] as Audience;
      stagedStates.push({ ...staged });
      return options.receipts?.[mutation] ?? receipt;
    }),
    execute: forbidden,
    transaction: forbidden,
    withUser: forbidden,
    withOrg: forbidden,
    dispose: forbidden,
  };
  const transaction = vi.fn(async (callback: (adapter: typeof tx) => Promise<unknown>) => {
    events.push('begin');
    staged = { ...committed };
    let result: unknown;
    try {
      result = await callback(tx);
      events.push('callback resolved');
    } catch (error) {
      events.push('callback aborted');
      staged = { ...committed };
      throw error;
    }
    committed = { ...staged };
    events.push('commit modeled');
    await options.beforeAcknowledgement?.();
    if (options.rejectAcknowledgement) {
      events.push('acknowledgement rejected');
      throw failure;
    }
    events.push('transaction resolved');
    return result;
  });
  const db = { ...tx, query: forbidden, transaction };
  return {
    db: db as never,
    issued,
    events,
    stagedStates,
    failure,
    forbidden,
    transaction,
    state: () => ({ ...committed }),
  };
}

function audienceInput(visibility: Audience, grantOrganizationId: string | null) {
  return {
    userId: 'user_owner',
    token: TOKEN,
    sharedSessionId: SESSION,
    organizationId: CAPTURED_ORG,
    visibility,
    grantOrganizationId,
  };
}

describe('updateSharedSessionAudience (UNRUN mock transaction model)', () => {
  it('exposes exact audit metadata only after transaction acknowledgement resolves', async () => {
    let releaseAcknowledgement!: () => void;
    let signalCommit!: () => void;
    const acknowledgement = new Promise<void>((resolve) => { releaseAcknowledgement = resolve; });
    const reachedCommit = new Promise<void>((resolve) => { signalCommit = resolve; });
    const model = makeAudienceTransactionModel({ grant: ORG, visibility: 'organization' }, {
      beforeAcknowledgement: async () => {
        signalCommit();
        await acknowledgement;
      },
    });
    // This is a consumer spy, not the route's audit implementation.
    const auditConsumer = vi.fn((result: unknown) => result);
    const pending = updateSharedSessionAudience(model.db, audienceInput('public', ORG))
      .then(auditConsumer);
    await reachedCommit;
    expect(model.events).toEqual(['begin', 'delete', 'update', 'callback resolved', 'commit modeled']);
    expect(auditConsumer).not.toHaveBeenCalled();
    releaseAcknowledgement();
    const expected = {
      updated: { token: TOKEN, visibility: 'public', expiresAt: '2026-09-20T00:00:00.000Z' },
      revokedOrganizationId: ORG,
    };
    await expect(pending).resolves.toEqual(expected);
    expect(auditConsumer).toHaveBeenCalledTimes(1);
    expect(auditConsumer).toHaveBeenCalledWith(expected);
    expect(model.events.at(-1)).toBe('transaction resolved');
    expect(model.forbidden).not.toHaveBeenCalled();
  });

  it.each([
    { visibility: 'organization' as const, grant: null, before: 'public' as const,
      mutations: ['grant', 'update'], afterGrant: CAPTURED_ORG, revoked: null },
    { visibility: 'public' as const, grant: ORG, before: 'organization' as const,
      mutations: ['delete', 'update'], afterGrant: null, revoked: ORG },
    { visibility: 'public' as const, grant: null, before: 'organization' as const,
      mutations: ['update'], afterGrant: null, revoked: null },
  ])('commits $visibility with observed grant $grant using only tx', async (scenario) => {
    const model = makeAudienceTransactionModel({
      grant: scenario.grant, visibility: scenario.before,
    });
    const result = await updateSharedSessionAudience(
      model.db, audienceInput(scenario.visibility, scenario.grant),
    );
    expect(result).toEqual({
      updated: {
        token: TOKEN, visibility: scenario.visibility, expiresAt: '2026-09-20T00:00:00.000Z',
      },
      revokedOrganizationId: scenario.revoked,
    });
    expect(model.events).toEqual([
      'begin', ...scenario.mutations, 'callback resolved', 'commit modeled', 'transaction resolved',
    ]);
    expect(model.state()).toEqual({ grant: scenario.afterGrant, visibility: scenario.visibility });
    expect(model.transaction).toHaveBeenCalledTimes(1);
    expect(model.forbidden).not.toHaveBeenCalled();
    expect(mockResolveOrgMembership).not.toHaveBeenCalled();
  });

  const firstMutationFailures: { label: string; visibility: Audience; options: TransactionModelOptions }[] = [
    { label: 'grant error', visibility: 'organization', options: { failAt: 'grant' } },
    { label: 'delete error', visibility: 'public', options: { failAt: 'delete' } },
    ...[
      { label: 'empty', rows: [] },
      { label: 'wrong organization', rows: [sharedRow({ organization_id: ORG })] },
      { label: 'wrong session', rows: [sharedRow({ organization_id: CAPTURED_ORG, shared_session_id: 'other' })] },
      { label: 'wrong actor', rows: [sharedRow({ organization_id: CAPTURED_ORG, shared_by_user_id: 'other' })] },
      { label: 'wrong owner', rows: [sharedRow({ organization_id: CAPTURED_ORG, owner_user_id: 'other' })] },
      { label: 'multiple', rows: [sharedRow({ organization_id: CAPTURED_ORG }), sharedRow({ organization_id: CAPTURED_ORG })] },
    ].map(({ label, rows }) => ({
      label: `${label} grant receipt`, visibility: 'organization' as const,
      options: { receipts: { grant: rows } },
    })),
    ...[
      { label: 'empty', rows: [] },
      { label: 'wrong session', rows: [{ shared_session_id: 'other' }] },
      { label: 'missing identity', rows: [{}] },
      { label: 'multiple', rows: [{ shared_session_id: SESSION }, { shared_session_id: SESSION }] },
    ].map(({ label, rows }) => ({
      label: `${label} delete receipt`, visibility: 'public' as const,
      options: { receipts: { delete: rows } },
    })),
  ];

  it.each(firstMutationFailures)('aborts before update for $label', async ({ visibility, options }) => {
    const initial = { grant: visibility === 'public' ? ORG : null, visibility: 'public' as const };
    const model = makeAudienceTransactionModel(initial, options);
    await expect(updateSharedSessionAudience(
      model.db, audienceInput(visibility, initial.grant),
    )).rejects.toThrow();
    expect(model.events).toEqual([
      'begin', visibility === 'public' ? 'delete' : 'grant', 'callback aborted',
    ]);
    expect(model.state()).toEqual(initial);
    expect(model.issued).toHaveLength(1);
    expect(model.transaction).toHaveBeenCalledTimes(1);
    expect(model.forbidden).not.toHaveBeenCalled();
  });

  describe.each(['public', 'organization'] as const)('%s update failure', (visibility) => {
    it.each([
      { label: 'query error', rows: [] },
      { label: 'empty', rows: [] },
      { label: 'wrong id', rows: [sessionRow({ id: 'other', visibility })] },
      { label: 'wrong token', rows: [sessionRow({ token: 'BBBBBBBBBBBBBBBBBBBBBBBB', visibility })] },
      { label: 'wrong owner', rows: [sessionRow({ owner_id: 'other', visibility })] },
      { label: 'unknown raw visibility', rows: [sessionRow({ visibility: 'unknown' })] },
      { label: 'missing raw visibility', rows: [sessionRow({ visibility: undefined })] },
      { label: 'wrong visibility', rows: [sessionRow({ visibility: visibility === 'public' ? 'organization' : 'public' })] },
      { label: 'multiple', rows: [sessionRow({ visibility }), sessionRow({ visibility })] },
    ])('rolls back the first modeled mutation for $label', async ({ label, rows }) => {
      const initial: AudienceState = {
        grant: visibility === 'public' ? ORG : null,
        visibility: visibility === 'public' ? 'organization' : 'public',
      };
      const model = makeAudienceTransactionModel(initial, {
        receipts: { update: rows },
        failAt: label === 'query error' ? 'update' : undefined,
      });
      const consumer = vi.fn();
      await expect(updateSharedSessionAudience(
        model.db, audienceInput(visibility, initial.grant),
      ).then(consumer)).rejects.toThrow();
      expect(model.events).toEqual([
        'begin', visibility === 'public' ? 'delete' : 'grant', 'update', 'callback aborted',
      ]);
      expect(model.state()).toEqual(initial);
      expect(model.stagedStates[0]).toEqual({
        grant: visibility === 'public' ? null : CAPTURED_ORG,
        visibility: initial.visibility,
      });
      expect(model.issued).toHaveLength(2);
      expect(model.transaction).toHaveBeenCalledTimes(1);
      expect(model.forbidden).not.toHaveBeenCalled();
      expect(consumer).not.toHaveBeenCalled();
    });
  });

  it.each(['public', 'organization'] as const)(
    'does not retry or expose success after uncertain %s commit acknowledgement',
    async (visibility) => {
      const initial: AudienceState = {
        grant: visibility === 'public' ? ORG : null,
        visibility: visibility === 'public' ? 'organization' : 'public',
      };
      const model = makeAudienceTransactionModel(initial, { rejectAcknowledgement: true });
      const consumer = vi.fn();
      await expect(updateSharedSessionAudience(
        model.db, audienceInput(visibility, initial.grant),
      ).then(consumer)).rejects.toBe(model.failure);
      expect(model.state()).toEqual({
        grant: visibility === 'organization' ? CAPTURED_ORG : null, visibility,
      });
      expect(model.events).toEqual([
        'begin', visibility === 'public' ? 'delete' : 'grant', 'update',
        'callback resolved', 'commit modeled', 'acknowledgement rejected',
      ]);
      expect(model.transaction).toHaveBeenCalledTimes(1);
      expect(model.issued).toHaveLength(2);
      expect(model.forbidden).not.toHaveBeenCalled();
      expect(consumer).not.toHaveBeenCalled();
    },
  );
});
