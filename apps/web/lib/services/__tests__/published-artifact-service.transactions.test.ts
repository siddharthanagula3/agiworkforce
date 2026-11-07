import { describe, expect, it, vi } from 'vitest';
import type { PublishedArtifactRow } from '../published-artifact-service';

vi.mock('server-only', () => ({}));

import {
  publishArtifactRecord,
  restorePublishedArtifactRecord,
} from '../published-artifact-service';

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const input = {
  userId: 'user-1',
  artifactId: 'artifact-1',
  title: 'Incoming title',
  kind: 'html',
  language: null,
  content: '<p>new</p>',
};
const identity = { publishedArtifactId: 'publication-1', token: TOKEN };

type Live = PublishedArtifactRow & { version: number };
type History = {
  id: string;
  published_artifact_id: string;
  user_id: string;
  version: number | string;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  parent_version_id: string | null;
};
type State = { live: Live | null; history: History[] };
type Operation = 'publish' | 'restore';
type Stage = 'history-read' | 'history-insert' | 'pointer';

function initial(): State {
  const live: Live = {
    id: identity.publishedArtifactId,
    token: TOKEN,
    user_id: input.userId,
    artifact_id: input.artifactId,
    conversation_id: 'original-conversation',
    title: 'Current title',
    kind: 'html',
    language: null,
    content: '<p>old</p>',
    visibility: 'invited',
    version: 1,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
  return {
    live,
    history: [{
      id: 'history-1',
      published_artifact_id: live.id,
      user_id: live.user_id,
      version: 1,
      title: live.title,
      kind: live.kind,
      language: live.language,
      content: live.content,
      parent_version_id: null,
    }],
  };
}

// This models owner admission locking for publish and live DML locking for restore.
// It tests service ownership, rollback and ordering, not PostgreSQL locks, isolation, RLS or triggers.
function model(options: {
  state?: State;
  fail?: Stage;
  insertReceipt?: unknown[];
  pointerReceipt?: unknown[];
  writeReceipt?: unknown[];
  usesConnectors?: boolean;
  beforeCommit?: () => Promise<void>;
  lockAttempt?: (transaction: number) => void;
  commitErrorAfterApply?: Error;
} = {}) {
  let committed = structuredClone(options.state ?? initial());
  let tail: Promise<void> = Promise.resolve();
  const calls: { transaction: number; sql: string; params: unknown[] }[] = [];
  let nextTransaction = 0;
  const db = {
    query: vi.fn(async () => {
      throw new Error('Root query escaped transaction');
    }),
    transaction: vi.fn(async (
      callback: (tx: {
        query: (sql: string, params: unknown[]) => Promise<unknown[]>;
      }) => Promise<unknown>,
    ) => {
      const lock: { release?: () => void } = {};
      let staged = structuredClone(committed);
      const transaction = ++nextTransaction;
      let active = true;
      async function acquirePublication() {
        if (lock.release) return;
        const previous = tail;
        tail = new Promise<void>((resolve) => {
          lock.release = resolve;
        });
        options.lockAttempt?.(transaction);
        await previous;
        staged = structuredClone(committed);
      }
      const tx = {
        query: vi.fn(async (raw: string, params: unknown[] = []) => {
          if (!active) throw new Error('Transaction query after completion');
          const sql = raw.replace(/\s+/g, ' ').trim();
          if (
            sql.includes('pg_advisory_xact_lock') ||
            sql.startsWith('update public.published_artifacts set title')
          ) {
            await acquirePublication();
          }
          calls.push({ transaction, sql, params });
          if (sql.includes("current_setting('transaction_isolation')")) {
            return [{ isolation: 'read committed' }];
          }
          if (sql.includes('pg_advisory_xact_lock')) {
            expect(params).toEqual([input.userId]);
            return [{ locked: true }];
          }
          if (!lock.release && !sql.includes('as owned_conversations')) {
            throw new Error('History or pointer accessed before publication mutation');
          }
          if (sql.startsWith('select') && sql.includes('as owned_conversations')) {
            expect(params).toEqual([input.userId, null]);
            return [{ owned_conversations: 1 }];
          }
          if (sql.startsWith('select') && sql.endsWith('for update')) {
            expect(params).toEqual([input.userId, input.artifactId]);
            return staged.live ? [{
              id: staged.live.id, user_id: staged.live.user_id, artifact_id: staged.live.artifact_id,
            }] : [];
          }
          if (sql.includes('as published_count')) {
            expect(params).toEqual([input.userId]);
            return [{ published_count: staged.live ? 1 : 0 }];
          }
          if (sql.startsWith('insert into public.published_artifacts ')) {
            expect(sql).toContain('on conflict (user_id, artifact_id) do update set');
            expect(sql).not.toContain('token = excluded.token');
            expect(sql).not.toContain('visibility = excluded.visibility');
            expect(sql).toContain('live.user_id = $2 and live.artifact_id::text = lower($3)');
            expect(sql).toContain("then 'invited' else 'public' end");
            if (staged.live) {
              staged.live = {
                ...staged.live,
                conversation_id:
                  params[3] === null ? staged.live.conversation_id : String(params[3]),
                title: staged.live.title || String(params[4]),
                kind: String(params[5]),
                language: params[6] as string | null,
                content: String(params[7]),
                updated_at: 'changed',
              };
            } else {
              staged.live = {
                id: identity.publishedArtifactId,
                token: String(params[0]),
                user_id: String(params[1]),
                artifact_id: String(params[2]),
                conversation_id: params[3] as string | null,
                title: String(params[4]),
                kind: String(params[5]),
                language: params[6] as string | null,
                content: String(params[7]),
                visibility: options.usesConnectors ? 'invited' : 'public',
                version: 1,
                created_at: 'created',
                updated_at: 'created',
              };
            }
            return options.writeReceipt ?? [{ ...staged.live }];
          }
          if (sql.startsWith('update public.published_artifacts set title')) {
            expect(sql).toContain('where user_id = $1 and id = $2 and artifact_id = $3 and token = $4');
            expect(sql.split(' where ')[0]).toBe(
              "update public.published_artifacts set title = case when title = '' then $5 else title end, " +
                'kind = $6, language = $7, content = $8, updated_at = now()',
            );
            const live = staged.live;
            if (
              !live || live.user_id !== params[0] || live.id !== params[1] ||
              live.artifact_id !== params[2] || live.token !== params[3]
            ) return [];
            staged.live = {
              ...live,
              title: live.title || String(params[4]),
              kind: String(params[5]),
              language: params[6] as string | null,
              content: String(params[7]),
              updated_at: 'changed',
            };
            return options.writeReceipt ?? [{ ...staged.live }];
          }
          if (sql.startsWith('select') && sql.includes('from public.published_artifact_versions')) {
            expect(sql).toContain('where published_artifact_id = $1 and user_id = $2 order by version desc limit 1');
            if (options.fail === 'history-read') throw new Error('history-read failed');
            return staged.history
              .filter((entry) =>
                entry.published_artifact_id === params[0] && entry.user_id === params[1],
              )
              .slice(-1);
          }
          if (sql.startsWith('insert into public.published_artifact_versions ')) {
            if (options.fail === 'history-insert') throw new Error('history-insert failed');
            expect(sql).toContain('returning version');
            const entry: History = {
              id: `history-${params[2]}`,
              published_artifact_id: String(params[0]),
              user_id: String(params[1]),
              version: params[2] as number,
              title: String(params[3]),
              kind: String(params[4]),
              language: params[5] as string | null,
              content: String(params[6]),
              parent_version_id: params[7] as string | null,
            };
            staged.history.push(entry);
            return options.insertReceipt ?? [{ version: entry.version }];
          }
          if (sql.startsWith('update public.published_artifacts set version = $2')) {
            expect(sql).toContain('where id = $1 and user_id = $3 returning id, user_id, version');
            if (options.fail === 'pointer') throw new Error('pointer failed');
            if (!staged.live || staged.live.id !== params[0] || staged.live.user_id !== params[2]) return [];
            staged.live.version = Number(params[1]);
            return options.pointerReceipt ?? [{
              id: staged.live.id,
              user_id: staged.live.user_id,
              version: staged.live.version,
            }];
          }
          throw new Error(`Unexpected transaction SQL: ${sql}`);
        }),
      };
      try {
        const result = await callback(tx);
        await options.beforeCommit?.();
        if (lock.release) committed = staged;
        if (options.commitErrorAfterApply) throw options.commitErrorAfterApply;
        return result;
      } finally {
        active = false;
        lock.release?.();
      }
    }),
  };
  return { db, calls, current: () => structuredClone(committed) };
}

function mutate(state: ReturnType<typeof model>, operation: Operation, content = input.content) {
  return operation === 'publish'
    ? publishArtifactRecord(state.db as never, { ...input, content })
    : restorePublishedArtifactRecord(state.db as never, { ...input, ...identity, content });
}

for (const operation of ['publish', 'restore'] as const) {
  describe(`${operation} transactional persistence (modeled)`, () => {
    it('commits live content, matching history and pointer in one transaction', async () => {
      const state = model();
      const result = await mutate(state, operation);
      expect(result).toMatchObject({
        version: 2,
        content: input.content,
        title: 'Current title',
        visibility: 'invited',
        conversationId: 'original-conversation',
      });
      expect(state.db.transaction).toHaveBeenCalledTimes(1);
      expect(state.db.query).not.toHaveBeenCalled();
      expect(state.current().live?.version).toBe(2);
      expect(state.current().history[1]).toMatchObject({
        version: 2,
        content: input.content,
        parent_version_id: 'history-1',
      });
      expect(state.calls.map((call) => call.transaction)).toEqual(
        Array(operation === 'publish' ? 8 : 5).fill(1),
      );
    });

    it.each(['history-read', 'history-insert', 'pointer'] as const)(
      'rolls back all state on %s failure',
      async (fail) => {
        const state = model({ fail });
        const before = state.current();
        await expect(mutate(state, operation)).rejects.toThrow(`${fail} failed`);
        expect(state.current()).toEqual(before);
      },
    );

    it.each([
      [{}],
      [{ ...initial().live!, id: '' }],
      [{ ...initial().live!, user_id: 'foreign' }],
      [{ ...initial().live!, artifact_id: 'other' }],
      [initial().live!, initial().live!],
    ].map((writeReceipt) => ({ writeReceipt })))(
      'rolls back an invalid live write identity before history: %j',
      async ({ writeReceipt }) => {
        const state = model({ writeReceipt });
        await expect(mutate(state, operation)).rejects.toThrow();
        expect(state.current()).toEqual(initial());
        expect(state.calls.some((call) => call.sql.includes('public.published_artifact_versions'))).toBe(false);
      },
    );

    it.each([
      [],
      [{}],
      [{ version: 0 }],
      [{ version: -1 }],
      [{ version: 'oops' }],
      [{ version: 1.5 }],
      [{ version: Number.MAX_SAFE_INTEGER + 1 }],
      [{ version: 3 }],
    ].map((insertReceipt) => ({ insertReceipt })))(
      'rolls back an invalid insert receipt: %j',
      async ({ insertReceipt }) => {
        const state = model({ insertReceipt });
        await expect(mutate(state, operation)).rejects.toThrow();
        expect(state.current()).toEqual(initial());
      },
    );

    it.each([
      [],
      [{}],
      [{ id: 'foreign', user_id: input.userId, version: 2 }],
      [{ id: identity.publishedArtifactId, user_id: 'foreign', version: 2 }],
      [{ id: identity.publishedArtifactId, user_id: input.userId, version: 0 }],
      [{ id: identity.publishedArtifactId, user_id: input.userId, version: 3 }],
      [
        { id: identity.publishedArtifactId, user_id: input.userId, version: 2 },
        { id: identity.publishedArtifactId, user_id: input.userId, version: 2 },
      ],
    ].map((pointerReceipt) => ({ pointerReceipt })))(
      'rolls back an invalid pointer receipt: %j',
      async ({ pointerReceipt }) => {
        const state = model({ pointerReceipt });
        await expect(mutate(state, operation)).rejects.toThrow();
        expect(state.current()).toEqual(initial());
      },
    );

    it('deduplicates identical payloads while repairing a stale pointer', async () => {
      const seed = initial();
      seed.live!.version = 9;
      const state = model({ state: seed });
      expect(await mutate(state, operation, seed.live!.content)).toMatchObject({ version: 1 });
      expect(state.current().history).toEqual(seed.history);
      expect(state.current().live?.version).toBe(1);
      expect(state.calls.some((call) =>
        call.sql.startsWith('insert into public.published_artifact_versions'),
      )).toBe(false);
      expect(state.calls.at(-1)?.sql).toContain('set version = $2');
    });

    it('rejects malformed newest history without committing live content', async () => {
      const seed = initial();
      seed.history[0]!.version = 0;
      const state = model({ state: seed });
      await expect(mutate(state, operation)).rejects.toThrow();
      expect(state.current()).toEqual(seed);
    });
  });
}

it.each([{ id: 'replacement' }, { token: 'bbbbbbbbbbbbbbbbbbbbbbbb' }])(
  'rolls back an inexact restore write receipt: %j',
  async (change) => {
    const state = model({ writeReceipt: [{ ...initial().live!, ...change }] });
    await expect(mutate(state, 'restore')).rejects.toThrow();
    expect(state.current()).toEqual(initial());
    expect(state.calls.some((call) => call.sql.includes('public.published_artifact_versions'))).toBe(false);
  },
);

it.each(['history-read', 'history-insert', 'pointer'] as const)(
  'leaves no first publication after %s failure',
  async (fail) => {
    const empty: State = { live: null, history: [] };
    const state = model({ state: empty, fail });
    await expect(mutate(state, 'publish')).rejects.toThrow();
    expect(state.current()).toEqual(empty);
  },
);

it.each([false, true])('retains first-publication connector default: %s', async (usesConnectors) => {
  const state = model({ state: { live: null, history: [] }, usesConnectors });
  expect(await mutate(state, 'publish')).toMatchObject({
    version: 1,
    visibility: usesConnectors ? 'invited' : 'public',
    conversationId: null,
  });
});

it.each([
  ['publish', 'publish'],
  ['restore', 'restore'],
  ['publish', 'restore'],
  ['restore', 'publish'],
] as const)('serializes distinct %s/%s payloads with matching receipts', async (first, second) => {
  let entered!: () => void;
  let release!: () => void;
  let secondAttempted!: () => void;
  const firstMutated = new Promise<void>((resolve) => { entered = resolve; });
  const secondLockAttempt = new Promise<void>((resolve) => { secondAttempted = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let commits = 0;
  const state = model({
    beforeCommit: async () => {
      if (++commits === 1) { entered(); await gate; }
    },
    lockAttempt: (transaction) => { if (transaction === 2) secondAttempted(); },
  });
  const firstResult = mutate(state, first, '<p>A</p>');
  await firstMutated;
  const secondResult = mutate(state, second, '<p>B</p>');
  await secondLockAttempt;
  expect(commits).toBe(1);
  expect(state.current()).toEqual(initial());
  expect(state.calls.some((call) => call.transaction === 2 && (
    call.sql.startsWith('insert') || call.sql.startsWith('update') ||
    call.sql.includes('from public.published_artifact_versions')
  ))).toBe(false);
  release();
  const results = await Promise.all([firstResult, secondResult]);
  expect(results.map((result) => result?.version)).toEqual([2, 3]);
  const committed = state.current();
  for (const result of results) {
    expect(committed.history.find((entry) => entry.version === result?.version)?.content).toBe(result?.content);
  }
  expect(committed.live).toMatchObject({ version: 3, content: '<p>B</p>' });
  expect(committed.history[2]?.parent_version_id).toBe('history-2');
  const mutations = state.calls.filter((call) =>
    call.sql.startsWith('insert') || call.sql.startsWith('update') ||
    call.sql.includes('from public.published_artifact_versions'),
  );
  expect(mutations.map((call) => call.transaction)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
});

it('serializes concurrent first publishes to one stable URL and sequential history', async () => {
  const state = model({ state: { live: null, history: [] } });
  const [first, second] = await Promise.all([
    mutate(state, 'publish', 'A'),
    mutate(state, 'publish', 'B'),
  ]);
  expect(first?.token).toBe(second?.token);
  expect(state.current().history.map((entry) => entry.version)).toEqual([1, 2]);
  expect(state.current().live).toMatchObject({ token: first?.token, content: 'B', version: 2 });
});

it('deduplicates concurrent identical publishes', async () => {
  const state = model();
  const results = await Promise.all([mutate(state, 'publish'), mutate(state, 'publish')]);
  expect(results.map((result) => result?.version)).toEqual([2, 2]);
  expect(state.current().history).toHaveLength(2);
  expect(state.current().live?.version).toBe(2);
});

it.each([
  null,
  { id: 'replacement' },
  { user_id: 'foreign' },
  { artifact_id: 'other' },
  { token: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
])('refuses deleted or replaced v19 restore identity without insert fallback: %j', async (change) => {
  const seed = initial();
  seed.live = change === null ? null : { ...seed.live!, ...change };
  const state = model({ state: seed });
  expect(await mutate(state, 'restore')).toBeNull();
  expect(state.current()).toEqual(seed);
  expect(state.calls).toHaveLength(2);
  expect(state.calls.some((call) => call.sql.startsWith('insert'))).toBe(false);
});

for (const operation of ['publish', 'restore'] as const) {
  it(`${operation} cannot report success before commit resolves`, async () => {
    let enterCommit!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterCommit = resolve;
    });
    let releaseCommit!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const state = model({
      beforeCommit: async () => {
        enterCommit();
        await gate;
      },
    });
    let settled = false;
    const pending = mutate(state, operation).then((result) => {
      settled = true;
      return result;
    });
    await entered;
    expect(settled).toBe(false);
    expect(state.current()).toEqual(initial());
    releaseCommit();
    expect(await pending).toMatchObject({ version: 2 });
    expect(state.current().live?.version).toBe(2);
  });

  it(`${operation} does not replay an uncertain commit result`, async () => {
    const error = new Error('Commit acknowledgment lost after modeled apply');
    const state = model({ commitErrorAfterApply: error });
    await expect(mutate(state, operation)).rejects.toBe(error);
    expect(state.db.transaction).toHaveBeenCalledTimes(1);
    expect(state.current().live).toMatchObject({ version: 2, content: input.content });
    expect(state.current().history).toHaveLength(2);
  });
}
