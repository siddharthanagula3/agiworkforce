import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { addSiteViewer, MAX_VIEWERS_PER_SITE, ViewerLimitError } from '../published-site-viewer-service';

type Phase = 'ownership' | 'isolation' | 'lock' | 'existing' | 'count' | 'insert' | 'list';
type Viewer = { email: string; created_at: string };
const input = { userId: 'owner-a', token: 'aaaaaaaaaaaaaaaaaaaaaaaa', email: 'new@example.com' };
const otherToken = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const publication = 'publication-a';
const otherPublication = 'publication-b';
const timestamp = '2026-11-01T00:00:00Z';

function inventory(count: number): Viewer[] {
  return Array.from({ length: count }, (_, index) => ({ email: `person-${index}@example.com`, created_at: timestamp }));
}

// Deterministic service-protocol simulation only; this does not prove PostgreSQL
// snapshots, advisory locks, RLS, adapter cleanup, or live concurrency behavior.
function simulation(options: {
  count?: number;
  receipt?: { phase: Phase; rows: unknown };
  reject?: Phase;
  locked?: (id: string) => Promise<void>;
} = {}) {
  const live = new Map([[publication, inventory(options.count ?? 0)], [otherPublication, inventory(options.count ?? 0)]]);
  const tails = new Map<string, Promise<void>>();
  const calls: { transaction: number; phase: Phase; sql: string; params: unknown[] }[] = [];
  const releases: number[] = [];
  let nextTransaction = 0;
  let reject = options.reject;
  const db = {
    query: vi.fn(async () => { throw new Error('Outer query escaped transaction'); }),
    transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) => {
      const transaction = ++nextTransaction;
      let id: string | undefined;
      let staged: Viewer[] | undefined;
      let release: (() => void) | undefined;
      let active = true;
      const receipt = (phase: Phase, sql: string, params: unknown[], rows: unknown) => {
        calls.push({ transaction, phase, sql, params });
        if (reject === phase) {
          reject = undefined;
          throw new Error(`${phase} rejected`);
        }
        return options.receipt?.phase === phase ? options.receipt.rows : rows;
      };
      const tx = {
        query: async (sql: string, params: unknown[] = []) => {
          expect(active).toBe(true);
          if (sql.includes('from public.published_artifacts ')) {
            expect(sql).toContain('where token = $1 and user_id = $2');
            const found = params[1] === input.userId
              ? params[0] === input.token ? publication : params[0] === otherToken ? otherPublication : undefined
              : undefined;
            return receipt('ownership', sql, params, found ? [{ id: found }] : []);
          }
          if (sql.includes("current_setting('transaction_isolation')")) {
            return receipt('isolation', sql, params, [{ isolation: 'read committed' }]);
          }
          if (sql.includes('pg_advisory_xact_lock')) {
            expect(sql).toContain("hashtextextended('agi:published-site-viewer-quota:' || $1, 0)");
            expect(sql).not.toContain('count(');
            expect(sql).not.toContain('from public.');
            expect(params).toHaveLength(1);
            id = String(params[0]);
            const previous = tails.get(id) ?? Promise.resolve();
            const held = new Promise<void>((resolve) => { release = resolve; });
            tails.set(id, previous.then(() => held));
            await previous;
            staged = structuredClone(live.get(id) ?? []);
            await options.locked?.(id);
            return receipt('lock', sql, params, [{ locked: true }]);
          }
          expect(id).toBeDefined();
          expect(staged).toBeDefined();
          if (sql.includes('select email from public.published_artifact_viewers')) {
            expect(sql).toContain('where published_artifact_id = $1 and email = $2 and invited_by_user_id = $3');
            expect(params[0]).toBe(id);
            expect(params[2]).toBe(input.userId);
            return receipt('existing', sql, params, staged!.filter((row) => row.email === params[1]).map(({ email }) => ({ email })));
          }
          if (sql.includes('count(*)')) {
            expect(sql).toContain('where published_artifact_id = $1 and invited_by_user_id = $2');
            expect(params).toEqual([id, input.userId]);
            return receipt('count', sql, params, [{ total: staged!.length }]);
          }
          if (sql.includes('insert into public.published_artifact_viewers')) {
            expect(sql).toContain('values ($1, $2, $3)');
            expect(sql).toContain('on conflict (published_artifact_id, email) do nothing');
            expect(params[0]).toBe(id);
            expect(params[2]).toBe(input.userId);
            const result = receipt('insert', sql, params, []);
            if (!staged!.some((row) => row.email === params[1])) {
              staged!.push({ email: String(params[1]), created_at: timestamp });
            }
            return result;
          }
          if (sql.includes('select email, created_at')) {
            expect(sql).toContain('where published_artifact_id = $1 and invited_by_user_id = $2');
            expect(params).toEqual([id, input.userId]);
            return receipt('list', sql, params, structuredClone(staged));
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      } as unknown as DatabaseAdapter;
      try {
        const result = await callback(tx);
        if (id && staged) live.set(id, staged);
        return result;
      } finally {
        active = false;
        releases.push(transaction);
        release?.();
      }
    }),
  };
  return { db: db as unknown as DatabaseAdapter, calls, releases, current: (id = publication) => structuredClone(live.get(id)) };
}

function add(state: ReturnType<typeof simulation>, overrides: Partial<typeof input> = {}) {
  return addSiteViewer(state.db, { ...input, ...overrides });
}

function inserts(state: ReturnType<typeof simulation>) {
  return state.calls.filter((call) => call.phase === 'insert');
}

describe('site viewer quota admission (service-protocol simulation only)', () => {
  it('admits one of two distinct viewers competing for the last slot', async () => {
    const state = simulation({ count: MAX_VIEWERS_PER_SITE - 1 });
    const results = await Promise.allSettled([add(state), add(state, { email: 'second@example.com' })]);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(ViewerLimitError) });
    expect(state.current()).toHaveLength(MAX_VIEWERS_PER_SITE);
    expect(inserts(state)).toHaveLength(1);
    expect(state.db.query).not.toHaveBeenCalled();
    expect(state.db.transaction).toHaveBeenCalledTimes(2);
    expect(state.releases).toEqual([1, 2]);
    for (const transaction of [1, 2]) {
      const sequence = state.calls.filter((call) => call.transaction === transaction);
      expect(sequence.slice(0, 5).map((call) => call.phase)).toEqual(['ownership', 'isolation', 'lock', 'existing', 'count']);
      expect(sequence[2]?.params).toEqual([publication]);
    }
    expect(state.calls.filter((call) => call.transaction === 1).map((call) => call.phase)).toEqual([
      'ownership', 'isolation', 'lock', 'existing', 'count', 'insert', 'ownership', 'list',
    ]);
  });

  it('serializes the same email into one row and skips the second count and insert', async () => {
    const state = simulation({ count: MAX_VIEWERS_PER_SITE - 1 });
    const results = await Promise.all([add(state), add(state)]);
    expect(results[0]).toEqual(results[1]);
    expect(state.current()).toHaveLength(MAX_VIEWERS_PER_SITE);
    expect(inserts(state)).toHaveLength(1);
    expect(state.calls.filter((call) => call.phase === 'count')).toHaveLength(1);
  });

  it.each([MAX_VIEWERS_PER_SITE, MAX_VIEWERS_PER_SITE + 7])('allows only an existing viewer at inventory %i', async (count) => {
    const state = simulation({ count });
    expect(await add(state, { email: 'person-0@example.com' })).toHaveLength(count);
    expect(inserts(state)).toHaveLength(0);
    expect(state.calls.filter((call) => call.phase === 'count')).toHaveLength(0);
    await expect(add(state)).rejects.toBeInstanceOf(ViewerLimitError);
    expect(state.current()).toHaveLength(count);
    expect(inserts(state)).toHaveLength(0);
  });

  it('does not block a distinct publication behind the same owner publication key', async () => {
    let entered!: () => void;
    let release!: () => void;
    const enteredLock = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const state = simulation({
      locked: async (id) => { if (id === publication) { entered(); await gate; } },
    });
    const first = add(state);
    await enteredLock;
    try {
      expect(await add(state, { token: otherToken })).toHaveLength(1);
      expect(state.current()).toHaveLength(0);
      expect(state.current(otherPublication)).toHaveLength(1);
    } finally { release(); }
    await first;
    expect(state.calls.filter((call) => call.phase === 'lock').map((call) => call.params)).toEqual([[otherPublication], [publication]]);
  });

  it.each<Phase>(['lock', 'existing', 'count', 'insert', 'list'])('releases the simulated lock after a %s rejection', async (reject) => {
    const state = simulation({ count: MAX_VIEWERS_PER_SITE - 1, reject });
    await expect(add(state)).rejects.toThrow(`${reject} rejected`);
    expect(state.current()).toHaveLength(MAX_VIEWERS_PER_SITE - 1);
    expect(await add(state)).toHaveLength(MAX_VIEWERS_PER_SITE);
    expect(state.releases).toEqual([1, 2]);
  });

  it.each([
    ['ownership', null], ['ownership', {}], ['ownership', [{ id: publication }, { id: publication }]],
    ['ownership', [{}]], ['ownership', [{ id: '' }]], ['ownership', [{ id: ' ' }]], ['ownership', [{ id: 1 }]],
    ['isolation', null], ['isolation', []], ['isolation', [{}]], ['isolation', [{ isolation: 'repeatable read' }]],
    ['isolation', [{ isolation: 'serializable' }]], ['isolation', [{ isolation: 'READ COMMITTED' }]],
    ['isolation', [{ isolation: 'read committed' }, { isolation: 'read committed' }]],
    ['lock', null], ['lock', []], ['lock', [{}]], ['lock', [{ locked: false }]], ['lock', [{ locked: 'true' }]],
    ['lock', [{ locked: true }, { locked: true }]],
    ['existing', null], ['existing', {}], ['existing', [{}]], ['existing', [{ email: 'other@example.com' }]],
    ['existing', [{ email: input.email }, { email: input.email }]],
    ['count', null], ['count', []], ['count', [{}]], ['count', [{ total: 0 }, { total: 0 }]],
    ...[null, undefined, '', ' ', 'NaN', '1.5', '-1', '1e2', true, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '9007199254740992']
      .map((total) => ['count', [{ total }]]),
  ] as [Phase, unknown][])('rejects malformed %s evidence before insert: %j', async (phase, rows) => {
    const state = simulation({ receipt: { phase, rows } });
    await expect(add(state)).rejects.toThrow();
    expect(inserts(state)).toHaveLength(0);
    expect(state.current()).toHaveLength(0);
    expect(state.releases).toEqual([1]);
  });

  it.each([0, '0', '99'])('accepts a valid count receipt %j', async (total) => {
    const state = simulation({ receipt: { phase: 'count', rows: [{ total }] } });
    expect(await add(state)).toEqual([{ email: input.email, invitedAt: '2026-11-01T00:00:00.000Z' }]);
  });

  it.each([
    { token: 'invalid' }, { token: 'cccccccccccccccccccccccc' }, { userId: 'nonowner' },
  ])('returns null without locks or inserts for an unavailable owned publication: %j', async (overrides) => {
    const state = simulation();
    expect(await add(state, overrides)).toBeNull();
    expect(state.calls.every((call) => call.phase === 'ownership')).toBe(true);
    expect(inserts(state)).toHaveLength(0);
    expect(state.db.query).not.toHaveBeenCalled();
  });
});
