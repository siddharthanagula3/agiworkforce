import { describe, expect, it, vi } from 'vitest';
import type { PublishedArtifactRow } from '../published-artifact-service';

vi.mock('server-only', () => ({}));

import {
  MAX_PUBLISHED_PER_USER,
  PublishedArtifactQuotaError,
  publishArtifactRecord,
} from '../published-artifact-service';

type Live = PublishedArtifactRow & { version: number };
type Snapshot = {
  id: string;
  published_artifact_id: string;
  user_id: string;
  version: number;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  parent_version_id: string | null;
};
type Phase = 'ownership' | 'isolation' | 'lock' | 'existing' | 'count' | 'write';
const input = {
  userId: 'owner-a', artifactId: 'new-a', title: 'Page', kind: 'html', content: '<p>A</p>',
};

function seed(owner: string, artifact: string): Live {
  return {
    id: `${owner}:${artifact}`, user_id: owner, artifact_id: artifact,
    token: 'aaaaaaaaaaaaaaaaaaaaaaaa', conversation_id: null, title: 'Page', kind: 'html',
    language: null, content: '<p>before</p>', visibility: 'invited', version: 1,
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  };
}

// Deterministic service-protocol simulation, not evidence of PostgreSQL concurrency,
// statement snapshots, advisory locks, row locks, RLS, triggers, or adapter behavior.
function simulation(options: {
  rows?: Live[];
  receipt?: { phase: Phase; rows: unknown };
  reject?: Phase | 'history';
  locked?: (owner: string) => Promise<void>;
} = {}) {
  let live = structuredClone(options.rows ?? []);
  let history: Snapshot[] = [];
  const tails = new Map<string, Promise<void>>();
  const calls: { transaction: number; sql: string; params: unknown[] }[] = [];
  let nextTransaction = 0;
  const db = {
    query: vi.fn(async () => { throw new Error('Root query escaped transaction'); }),
    transaction: vi.fn(async (callback: (tx: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>) => {
      const transaction = ++nextTransaction;
      let owner: string | undefined;
      let release: (() => void) | undefined;
      let staged: Live[] = [];
      let snapshots: Snapshot[] = [];
      let active = true;
      function receipt(phase: Phase, fallback: unknown) {
        if (options.reject === phase) throw new Error(`${phase} rejected`);
        return options.receipt?.phase === phase ? options.receipt.rows : fallback;
      }
      const tx = {
        query: async (raw: string, params: unknown[] = []) => {
          if (!active) throw new Error('Query after transaction completion');
          const sql = raw.replace(/\s+/g, ' ').trim();
          calls.push({ transaction, sql, params });
          if (sql.includes('as owned_conversations')) return receipt('ownership', [{ owned_conversations: 1 }]);
          if (sql.includes("current_setting('transaction_isolation')")) {
            return receipt('isolation', [{ isolation: 'read committed' }]);
          }
          if (sql.includes('pg_advisory_xact_lock')) {
            expect(sql).toContain('hashtextextended');
            expect(sql).toContain('agi:published-artifact-quota:');
            expect(params).toHaveLength(1);
            owner = String(params[0]);
            const previous = tails.get(owner) ?? Promise.resolve();
            tails.set(owner, new Promise<void>((resolve) => { release = resolve; }));
            await previous;
            staged = structuredClone(live.filter((row) => row.user_id === owner));
            snapshots = structuredClone(history.filter((row) => row.user_id === owner));
            await options.locked?.(owner);
            return receipt('lock', [{ locked: true }]);
          }
          if (!release) throw new Error('Read or mutation before owner lock');
          if (sql.startsWith('select') && sql.endsWith('for update')) {
            expect(sql).toContain('where user_id = $1 and artifact_id = $2');
            expect(params[0]).toBe(owner);
            const found = staged.filter((row) => row.artifact_id === params[1]);
            return receipt('existing', found.map(({ id, user_id, artifact_id }) => ({ id, user_id, artifact_id })));
          }
          if (sql.includes('as published_count')) {
            expect(sql).toContain('where user_id = $1');
            expect(sql).not.toContain('artifact_id <>');
            expect(params).toEqual([owner]);
            return receipt('count', [{ published_count: staged.length }]);
          }
          if (sql.startsWith('insert into public.published_artifacts ')) {
            const existing = staged.find((row) => row.artifact_id === params[2]);
            const next: Live = {
              ...(existing ?? seed(String(params[1]), String(params[2]))),
              token: existing?.token ?? String(params[0]), title: existing?.title || String(params[4]),
              kind: String(params[5]), language: params[6] as string | null, content: String(params[7]),
            };
            staged = [...staged.filter((row) => row.id !== next.id), next];
            return receipt('write', [{ ...next }]);
          }
          if (sql.startsWith('select') && sql.includes('from public.published_artifact_versions')) {
            return snapshots.filter((row) => row.published_artifact_id === params[0]).slice(-1);
          }
          if (sql.startsWith('insert into public.published_artifact_versions ')) {
            if (options.reject === 'history') throw new Error('history rejected');
            const snapshot: Snapshot = {
              id: `${params[0]}:${params[2]}`, published_artifact_id: String(params[0]),
              user_id: String(params[1]), version: Number(params[2]), title: String(params[3]),
              kind: String(params[4]), language: params[5] as string | null,
              content: String(params[6]), parent_version_id: params[7] as string | null,
            };
            snapshots.push(snapshot);
            return [{ version: snapshot.version }];
          }
          if (sql.startsWith('update public.published_artifacts set version = $2')) {
            const row = staged.find((entry) => entry.id === params[0] && entry.user_id === params[2]);
            if (!row) return [];
            row.version = Number(params[1]);
            return [{ id: row.id, user_id: row.user_id, version: row.version }];
          }
          throw new Error(`Unexpected transaction SQL: ${sql}`);
        },
      };
      try {
        const result = await callback(tx);
        if (owner) {
          live = [...live.filter((row) => row.user_id !== owner), ...staged];
          history = [...history.filter((row) => row.user_id !== owner), ...snapshots];
        }
        return result;
      } finally {
        active = false;
        release?.();
      }
    }),
  };
  return { db, calls, current: () => structuredClone({ live, history }) };
}

function publish(state: ReturnType<typeof simulation>, overrides: Partial<typeof input> = {}) {
  return publishArtifactRecord(state.db as never, { ...input, ...overrides });
}

function inventory(count: number, owner = input.userId) {
  return Array.from({ length: count }, (_, index) => seed(owner, `existing-${index}`));
}

describe('publication quota admission (deterministic simulation only)', () => {
  it('admits only one of two different artifacts competing for the last slot', async () => {
    const state = simulation({ rows: inventory(MAX_PUBLISHED_PER_USER - 1) });
    const results = await Promise.allSettled([
      publish(state), publish(state, { artifactId: 'new-b' }),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(PublishedArtifactQuotaError) });
    expect(state.current().live).toHaveLength(MAX_PUBLISHED_PER_USER);
    expect(state.current().history).toHaveLength(1);
    const admitted = state.current().live.find((row) => row.artifact_id === input.artifactId)!;
    expect(state.current().history[0]).toMatchObject({ published_artifact_id: admitted.id, version: admitted.version, content: admitted.content });
    expect(state.calls.filter((call) => call.sql.includes('as published_count')).map((call) => call.transaction)).toEqual([1, 2]);
    expect(state.calls.filter((call) => call.sql.startsWith('insert into public.published_artifacts '))).toHaveLength(1);
    expect(state.db.query).not.toHaveBeenCalled();
    for (const transaction of [1, 2]) {
      const sequence = state.calls.filter((call) => call.transaction === transaction);
      const isolation = sequence.findIndex((call) => call.sql.includes("current_setting('transaction_isolation')"));
      const lock = sequence.findIndex((call) => call.sql.includes('pg_advisory_xact_lock'));
      const pin = sequence.findIndex((call) => call.sql.endsWith('for update'));
      const count = sequence.findIndex((call) => call.sql.includes('as published_count'));
      expect(isolation).toBeGreaterThanOrEqual(0);
      expect(isolation).toBeLessThan(lock);
      expect(lock).toBeLessThan(pin);
      expect(pin).toBeLessThan(count);
    }
  });

  it('does not serialize a different owner behind a held owner admission lock', async () => {
    let entered!: () => void;
    let release!: () => void;
    const firstLocked = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const state = simulation({
      rows: [...inventory(MAX_PUBLISHED_PER_USER - 1), ...inventory(MAX_PUBLISHED_PER_USER - 1, 'owner-b')],
      locked: async (owner) => { if (owner === input.userId) { entered(); await gate; } },
    });
    const first = publish(state);
    await firstLocked;
    try {
      expect(await publish(state, { userId: 'owner-b' })).toMatchObject({ userId: 'owner-b' });
      expect(state.current().live.filter((row) => row.user_id === input.userId)).toHaveLength(MAX_PUBLISHED_PER_USER - 1);
    } finally { release(); }
    await first;
    expect(state.current().live).toHaveLength(MAX_PUBLISHED_PER_USER * 2);
    expect(state.current().history).toHaveLength(2);
  });

  it('serializes the same artifact into one URL with chained history', async () => {
    const state = simulation({ rows: inventory(MAX_PUBLISHED_PER_USER - 1) });
    const [first, second] = await Promise.all([publish(state), publish(state, { content: '<p>B</p>' })]);
    expect(first.token).toBe(second.token);
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(state.current().live).toHaveLength(MAX_PUBLISHED_PER_USER);
    expect(state.current().history[1]).toMatchObject({ parent_version_id: state.current().history[0]?.id, content: '<p>B</p>', version: 2 });
    expect(state.current().live.find((row) => row.id === second.id)).toMatchObject({ version: 2, content: '<p>B</p>' });
    expect(state.calls.filter((call) => call.sql.includes('as published_count'))).toHaveLength(1);
  });

  it.each([MAX_PUBLISHED_PER_USER, MAX_PUBLISHED_PER_USER + 7])('republishes only a pinned existing row at inventory %i', async (count) => {
    const state = simulation({ rows: inventory(count) });
    expect(await publish(state, { artifactId: 'existing-0' })).toMatchObject({ id: `${input.userId}:existing-0` });
    expect(state.current().live).toHaveLength(count);
    expect(state.calls.some((call) => call.sql.includes('as published_count'))).toBe(false);
    const lock = state.calls.findIndex((call) => call.sql.includes('pg_advisory_xact_lock'));
    const pin = state.calls.findIndex((call) => call.sql.endsWith('for update'));
    const write = state.calls.findIndex((call) => call.sql.startsWith('insert into public.published_artifacts '));
    expect(lock).toBeLessThan(pin);
    expect(pin).toBeLessThan(write);
  });

  it.each([0, '0'])('accepts an exact zero count receipt: %j', async (published_count) => {
    const state = simulation({ receipt: { phase: 'count', rows: [{ published_count }] } });
    expect(await publish(state)).toMatchObject({ version: 1 });
    expect(state.current().live).toHaveLength(1);
  });

  it('rolls back an over-cap republish whose write receipt differs from the pinned id', async () => {
    const rows = inventory(MAX_PUBLISHED_PER_USER + 7);
    const state = simulation({
      rows,
      receipt: {
        phase: 'write',
        rows: [{ ...seed(input.userId, 'existing-0'), id: 'replacement-publication' }],
      },
    });
    await expect(publish(state, { artifactId: 'existing-0' })).rejects.toThrow();
    expect(state.current()).toEqual({ live: rows, history: [] });
    expect(state.calls.some((call) => call.sql.includes('as published_count'))).toBe(false);
    expect(state.calls.some((call) => call.sql.includes('public.published_artifact_versions'))).toBe(false);
  });

  it.each([MAX_PUBLISHED_PER_USER, MAX_PUBLISHED_PER_USER + 7])(
    'refuses an absent artifact at inventory %i without history or pointer changes',
    async (count) => {
      const rows = inventory(count);
      const state = simulation({ rows });
      await expect(publish(state)).rejects.toBeInstanceOf(PublishedArtifactQuotaError);
      expect(state.current()).toEqual({ live: rows, history: [] });
      expect(state.calls.some((call) => call.sql.startsWith('insert') || call.sql.startsWith('update'))).toBe(false);
    },
  );

  it.each(['isolation', 'lock', 'existing', 'count'] as const)('does not write after %s query rejection', async (reject) => {
    const state = simulation({ reject });
    await expect(publish(state)).rejects.toThrow(`${reject} rejected`);
    expect(state.current()).toEqual({ live: [], history: [] });
    expect(state.calls.some((call) => call.sql.startsWith('insert'))).toBe(false);
  });

  it('releases admission and rolls back live/history after a downstream failure', async () => {
    const rows = inventory(MAX_PUBLISHED_PER_USER - 1);
    const state = simulation({ rows, reject: 'history' });
    const results = await Promise.allSettled([publish(state), publish(state, { artifactId: 'new-b' })]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(state.current()).toEqual({ live: rows, history: [] });
    expect(state.calls.filter((call) => call.sql.includes('as published_count'))).toHaveLength(2);
    expect(state.calls.some((call) => call.sql.includes('set version = $2'))).toBe(false);
  });
});

const invalidReceipts: { phase: Phase; rows: unknown }[] = [
  ...(['ownership', 'isolation', 'lock', 'count', 'write'] as const).flatMap((phase) =>
    [[], [{}], [null], null, {}].map((rows) => ({ phase, rows })),
  ),
  ...['repeatable read', 'serializable', 'READ COMMITTED', null].map((isolation) => ({ phase: 'isolation' as const, rows: [{ isolation }] })),
  ...[false, 'true', 1, null].map((locked) => ({ phase: 'lock' as const, rows: [{ locked }] })),
  ...[null, undefined, '', ' ', '-1', '1.5', '1e2', -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map((published_count) => ({ phase: 'count' as const, rows: [{ published_count }] })),
  ...[null, undefined, '', ' ', '-1', '1.5', '1e2', -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map((owned_conversations) => ({ phase: 'ownership' as const, rows: [{ owned_conversations }] })),
  ...[null, {}].map((rows) => ({ phase: 'existing' as const, rows })),
  ...[{}, null, { id: '', user_id: input.userId, artifact_id: input.artifactId }, { id: 'row', user_id: 'foreign', artifact_id: input.artifactId }, { id: 'row', user_id: input.userId, artifact_id: 'other' }].map((row) => ({ phase: 'existing' as const, rows: [row] })),
  ...(['ownership', 'isolation', 'lock', 'existing', 'count', 'write'] as const).map((phase) => ({
    phase,
    rows: Array(2).fill({ ...seed(input.userId, input.artifactId), owned_conversations: 1, isolation: 'read committed', locked: true, published_count: 0 }),
  })),
  ...[{ user_id: 'foreign' }, { artifact_id: 'other' }, { id: '' }].map((change) => ({ phase: 'write' as const, rows: [{ ...seed(input.userId, input.artifactId), ...change }] })),
];

it.each(invalidReceipts)('fails closed and commits nothing for malformed $phase receipt %#', async (receipt) => {
  const state = simulation({ receipt });
  await expect(publish(state)).rejects.toThrow();
  expect(state.current()).toEqual({ live: [], history: [] });
  expect(state.calls.some((call) => call.sql.includes('insert into public.published_artifact_versions'))).toBe(false);
});
