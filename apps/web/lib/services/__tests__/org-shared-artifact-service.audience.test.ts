import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS } from '@agiworkforce/cloud-contracts';
import type { PublishedArtifactRow } from '../published-artifact-service';

const gates = vi.hoisted(() => ({ entitlement: vi.fn(), permission: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-entitlements')>()),
  organizationCanShareArtifacts: gates.entitlement,
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-permission-service')>()),
  requireOrganizationPermission: gates.permission,
}));

const { updatePublishedArtifactAudience } = await import('../org-shared-artifact-service');
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const OWNER = 'owner';
type Grant = { organization_id: string; published_artifact_id: string };
type State = { publication: PublishedArtifactRow; grants: Grant[] };
type Stage = 'lock' | 'read' | 'delete' | 'insert' | 'update' | 'final';

function initial(): State {
  return {
    publication: {
      id: ID,
      token: TOKEN,
      user_id: OWNER,
      artifact_id: 'artifact-1',
      conversation_id: null,
      title: 'Plan',
      kind: 'markdown',
      language: null,
      content: '# plan',
      visibility: 'organization',
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    },
    grants: [{ organization_id: A, published_artifact_id: ID }],
  };
}

// Staged adapter model only: PostgreSQL RLS, locks and concurrent writers require live validation.
function model(
  options: {
    intercept?: (stage: Stage, rows: unknown[]) => unknown[];
    commit?: () => Promise<void>;
    applyBeforeCommitAcknowledgement?: boolean;
    withoutGrant?: boolean;
  } = {},
) {
  let committed = initial();
  if (options.withoutGrant) committed.grants = [];
  let staged = initial();
  let reads = 0;
  const events: string[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    let stage: Stage;
    let rows: unknown[];
    if (text.startsWith('select') && text.includes('from public.published_artifacts')) {
      stage = 'lock';
      expect(text).toContain('where token = $1 and user_id = $2');
      expect(text).toContain('for update');
      expect(params).toEqual([TOKEN, OWNER]);
      rows = [{ ...staged.publication }];
    } else if (text.startsWith('select') && text.includes('organization_shared_artifacts')) {
      stage = reads++ === 0 ? 'read' : 'final';
      expect(text).toContain('where published_artifact_id = $1');
      expect(text).not.toContain('for update');
      expect(params).toEqual([ID]);
      rows = staged.grants.map((grant) => ({ ...grant }));
    } else if (text.startsWith('delete from public.organization_shared_artifacts')) {
      stage = 'delete';
      expect(text).toContain('where published_artifact_id = $1 and organization_id = $2');
      expect(params).toEqual([ID, A]);
      rows = staged.grants.map((grant) => ({ ...grant }));
      staged.grants = [];
    } else if (text.startsWith('insert into public.organization_shared_artifacts')) {
      stage = 'insert';
      expect(params).toEqual([B, ID, OWNER]);
      staged.grants = [{ organization_id: B, published_artifact_id: ID }];
      rows = staged.grants.map((grant) => ({ ...grant }));
    } else if (text.startsWith('update public.published_artifacts')) {
      stage = 'update';
      expect(text).toContain('where id = $1 and token = $2 and user_id = $3');
      expect(params.slice(0, 3)).toEqual([ID, TOKEN, OWNER]);
      staged.publication = {
        ...staged.publication,
        visibility: params[3] as PublishedArtifactRow['visibility'],
        title: (params[4] as string | null) ?? staged.publication.title,
      };
      rows = [{ ...staged.publication }];
    } else {
      throw new Error(`Unexpected transaction SQL: ${text}`);
    }
    events.push(stage);
    return options.intercept?.(stage, rows) ?? rows;
  });
  const tx = { query } as unknown as DatabaseAdapter;
  const rootQuery = vi.fn(async () => {
    throw new Error('Root query outside transaction');
  });
  const transaction = vi.fn(async (callback: (db: DatabaseAdapter) => Promise<unknown>) => {
    events.push('begin');
    staged = structuredClone(committed);
    reads = 0;
    let result: unknown;
    try {
      result = await callback(tx);
    } catch (error) {
      events.push('rollback');
      throw error;
    }
    events.push('commit-start');
    if (options.applyBeforeCommitAcknowledgement) committed = structuredClone(staged);
    await options.commit?.();
    committed = structuredClone(staged);
    events.push('commit');
    return result;
  });
  const db = { query: rootQuery, transaction } as unknown as DatabaseAdapter;
  const authorize = vi.fn(async () => {
    events.push('authorize');
  });
  const run = (overrides: Partial<Parameters<typeof updatePublishedArtifactAudience>[1]> = {}) =>
    updatePublishedArtifactAudience(db, {
      userId: OWNER,
      token: TOKEN,
      visibility: 'invited',
      organizationId: null,
      authorize,
      ...overrides,
    });
  return { db, tx, query, rootQuery, transaction, authorize, run, events, state: () => committed };
}

beforeEach(() => {
  vi.clearAllMocks();
  gates.entitlement.mockResolvedValue(true);
  gates.permission.mockResolvedValue(undefined);
});

describe('updatePublishedArtifactAudience transaction model (not database integration)', () => {
  it.each([
    ['Personal', null],
    ['workspace B', B],
    ['left workspace A', null],
  ])('removes the actual A grant with simulated %s input', async (_scope, organizationId) => {
    const m = model();
    expect(await m.run({ organizationId })).toMatchObject({
      organizationId: null,
      updated: { id: ID, visibility: 'invited' },
    });
    expect(m.authorize).toHaveBeenCalledWith({
      db: m.tx,
      publication: expect.objectContaining({ id: ID }),
      sharedOrganizationId: A,
    });
    expect(m.events).toEqual([
      'begin',
      'lock',
      'read',
      'authorize',
      'delete',
      'update',
      'final',
      'commit-start',
      'commit',
    ]);
    expect(m.state().grants).toEqual([]);
    expect(m.rootQuery).not.toHaveBeenCalled();
    expect(gates.permission).not.toHaveBeenCalled();
  });

  it('uses the explicit B target for both gates, the grant and the response', async () => {
    const m = model();
    expect(await m.run({ visibility: 'organization', organizationId: B })).toMatchObject({
      organizationId: B,
    });
    expect(gates.entitlement).toHaveBeenCalledExactlyOnceWith(B);
    expect(gates.permission).toHaveBeenCalledWith(OWNER, B, 'content.share', expect.any(String));
    expect(m.state().grants).toEqual([{ organization_id: B, published_artifact_id: ID }]);
  });

  it.each(['no-target', 'entitlement', 'permission', 'authorize'] as const)(
    'refuses %s before any mutation',
    async (refusal) => {
      const m = model();
      if (refusal === 'entitlement') gates.entitlement.mockResolvedValue(false);
      if (refusal === 'permission') gates.permission.mockRejectedValue(new Error('denied'));
      if (refusal === 'authorize') m.authorize.mockRejectedValue(new Error('gate refused'));
      await expect(
        m.run({ visibility: 'organization', organizationId: refusal === 'no-target' ? null : B }),
      ).rejects.toBeDefined();
      expect(m.events).not.toContain('delete');
      expect(m.events).not.toContain('insert');
      expect(m.events).not.toContain('update');
      expect(m.state()).toEqual(initial());
    },
  );

  it.each(['missing', 'foreign', 'wrong-token', 'duplicate'])(
    'rejects %s locked publication as 404 without touching grants',
    async (kind) => {
      const m = model({
        intercept: (stage, rows) => {
          if (stage !== 'lock') return rows;
          if (kind === 'missing') return [];
          if (kind === 'duplicate') return [...rows, ...rows];
          return [
            {
              ...initial().publication,
              ...(kind === 'foreign'
                ? { user_id: 'other' }
                : { token: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
            },
          ];
        },
      });
      await expect(m.run()).rejects.toMatchObject({ statusCode: 404 });
      expect(m.events).toEqual(['begin', 'lock', 'rollback']);
    },
  );

  it.each(['delete', 'insert', 'update', 'final'] as const)(
    'rolls back all staged changes if %s throws',
    async (failure) => {
      const m = model({
        intercept: (stage, rows) => {
          if (stage === failure) throw new Error(`failed ${failure}`);
          return rows;
        },
      });
      await expect(
        m.run({ visibility: 'organization', organizationId: B, title: 'Renamed' }),
      ).rejects.toThrow(`failed ${failure}`);
      expect(m.state()).toEqual(initial());
      expect(m.events.at(-1)).toBe('rollback');
      expect(m.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['delete', 'insert', 'update', 'final'] as const)(
    'rejects empty %s receipts and rolls back',
    async (failure) => {
      const m = model({ intercept: (stage, rows) => (stage === failure ? [] : rows) });
      await expect(m.run({ visibility: 'organization', organizationId: B })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(m.state()).toEqual(initial());
    },
  );

  it.each(['delete', 'insert', 'final'] as const)(
    'rejects a %s receipt for another publication or organization',
    async (failure) => {
      for (const changed of [{ published_artifact_id: 'other' }, { organization_id: 'other' }]) {
        const m = model({
          intercept: (stage, rows) =>
            stage === failure ? [{ ...(rows[0] as Grant), ...changed }] : rows,
        });
        await expect(
          m.run({ visibility: 'organization', organizationId: B }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(m.state()).toEqual(initial());
      }
    },
  );

  it.each(['id', 'token', 'user_id', 'visibility', 'title'] as const)(
    'rejects an update receipt with wrong %s',
    async (field) => {
      const m = model({
        intercept: (stage, rows) =>
          stage === 'update' ? [{ ...(rows[0] as PublishedArtifactRow), [field]: 'wrong' }] : rows,
      });
      await expect(m.run()).rejects.toMatchObject({ statusCode: 409 });
      expect(m.state()).toEqual(initial());
    },
  );

  it('rejects a stale grant after moving to invited', async () => {
    const m = model({ intercept: (stage, rows) => (stage === 'final' ? initial().grants : rows) });
    await expect(m.run()).rejects.toMatchObject({ statusCode: 409 });
    expect(m.state()).toEqual(initial());
  });

  it.each(['read', 'delete', 'insert', 'update', 'final'] as const)(
    'rejects duplicate %s receipts instead of accepting the first row',
    async (failure) => {
      const m = model({
        intercept: (stage, rows) => (stage === failure ? [...rows, ...rows] : rows),
      });
      await expect(m.run({ visibility: 'organization', organizationId: B })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(m.state()).toEqual(initial());
    },
  );

  it('refuses a grant lookup receipt for another publication before authorization', async () => {
    const m = model({
      intercept: (stage, rows) =>
        stage === 'read' ? [{ organization_id: A, published_artifact_id: 'other' }] : rows,
    });
    await expect(m.run()).rejects.toMatchObject({ statusCode: 409 });
    expect(m.authorize).not.toHaveBeenCalled();
    expect(m.state()).toEqual(initial());
  });

  it('does not rewrite a grant when the audience stays in the same workspace', async () => {
    const m = model();
    expect(await m.run({ visibility: 'organization', organizationId: A })).toMatchObject({
      organizationId: A,
    });
    expect(m.events).not.toContain('delete');
    expect(m.events).not.toContain('insert');
    expect(m.state().grants).toEqual(initial().grants);
  });

  it.each(['invited', 'public', 'organization'] as const)(
    'moves an ungranted publication to %s without attempting a deletion',
    async (visibility) => {
      const m = model({ withoutGrant: true });
      expect(await m.run({ visibility, organizationId: B })).toMatchObject({
        organizationId: visibility === 'organization' ? B : null,
        updated: { visibility },
      });
      expect(m.events).not.toContain('delete');
      expect(m.state().grants).toEqual(
        visibility === 'organization' ? [{ organization_id: B, published_artifact_id: ID }] : [],
      );
    },
  );

  it('rejects a whitespace-only inspected title before any grant mutation', async () => {
    const m = model();
    await expect(m.run({ title: '   ' })).rejects.toMatchObject({ statusCode: 404 });
    expect(m.events).toEqual(['begin', 'lock', 'rollback']);
    expect(m.state()).toEqual(initial());
  });

  it('normalizes the inspected title with the canonical length limit', async () => {
    const m = model();
    const title = 'x'.repeat(MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS + 1);
    expect(await m.run({ title: `  ${title}  ` })).toMatchObject({
      updated: { title: title.slice(0, MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS) },
    });
  });

  it('updates the title and audience in one exact publication statement', async () => {
    const m = model();
    expect(await m.run({ title: 'Renamed' })).toMatchObject({
      updated: { title: 'Renamed', visibility: 'invited' },
    });
    expect(m.events.filter((event) => event === 'update')).toHaveLength(1);
    expect(
      m.query.mock.calls.find(([sql]) => sql.includes('update public.published_artifacts'))?.[1],
    ).toEqual([ID, TOKEN, OWNER, 'invited', 'Renamed']);
    expect(m.rootQuery).not.toHaveBeenCalled();
  });

  it('does not resolve until the adapter COMMIT resolves', async () => {
    let release!: () => void;
    let reached!: () => void;
    const reachedCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      release = resolve;
    });
    const m = model({
      commit: async () => {
        reached();
        await commit;
      },
    });
    let resolved = false;
    const result = m.run().then((value) => {
      resolved = true;
      return value;
    });
    await reachedCommit;
    expect(resolved).toBe(false);
    expect(m.state()).toEqual(initial());
    release();
    await result;
    expect(m.events.at(-1)).toBe('commit');
  });

  it('propagates an uncertain COMMIT error without retrying', async () => {
    const failure = new Error('COMMIT connection lost; server outcome unknown');
    const m = model({
      applyBeforeCommitAcknowledgement: true,
      commit: async () => {
        throw failure;
      },
    });
    await expect(m.run()).rejects.toBe(failure);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.events.filter((event) => event === 'delete')).toHaveLength(1);
    expect(m.events).not.toContain('rollback');
    expect(m.state().publication.visibility).toBe('invited');
    expect(m.state().grants).toEqual([]);
  });
});
