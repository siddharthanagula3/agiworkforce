import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const {
  ArtifactCommentLimitError,
  MAX_COMMENTS_PER_ARTIFACT,
  createArtifactComment,
  listArtifactComments,
} = await import('../artifact-comment-service');

const USER_ID = 'user-1';
const ARTIFACT_ID = 'artifact-1';

interface StoredRow {
  id: string;
  artifact_id: string;
  parent_id: string | null;
  anchor: unknown;
  body: string;
  author: string;
  resolved_at: null;
  created_at: string;
  updated_at: string;
}

function makeStore(existing: number, isolation = 'read committed') {
  const rows: StoredRow[] = Array.from({ length: existing }, (_, index) =>
    storedRow(`seed-${index}`),
  );
  const lockQueues = new Map<string, Promise<void>>();
  const listLimits: unknown[] = [];

  function storedRow(id: string, body = 'seed'): StoredRow {
    return {
      id,
      artifact_id: ARTIFACT_ID,
      parent_id: null,
      anchor: { kind: 'artifact' },
      body,
      author: 'user',
      resolved_at: null,
      created_at: '2026-11-09T00:00:00.000Z',
      updated_at: '2026-11-09T00:00:00.000Z',
    };
  }

  function dispatch(
    sql: string,
    params: unknown[],
    acquireLock: (key: string) => Promise<void>,
  ): Promise<unknown[]> {
    return (async () => {
      if (sql.includes('transaction_isolation')) return [{ isolation }];
      if (sql.includes('pg_advisory_xact_lock')) {
        await acquireLock(String(params[0]) + String(params[1]));
        return [{ locked: true }];
      }
      if (sql.includes('select count(*)')) {
        const total = rows.length;
        await Promise.resolve();
        await Promise.resolve();
        return [{ total }];
      }
      if (sql.includes('insert into public.artifact_comments')) {
        await Promise.resolve();
        const row = storedRow(`new-${rows.length}`, String(params[4]));
        rows.push(row);
        return [row];
      }
      if (sql.includes('from public.artifact_comments') && sql.includes('order by created_at')) {
        listLimits.push(params[2]);
        return rows.slice(0, params[2] === undefined ? undefined : Number(params[2]));
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    })();
  }

  const db = {
    query: vi.fn((sql: string, params: unknown[] = []) =>
      dispatch(sql, params, async () => undefined),
    ),
    transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) => {
      const held: Array<() => void> = [];
      const tx = {
        query: (sql: string, params: unknown[] = []) =>
          dispatch(sql, params, async (key) => {
            const previous = lockQueues.get(key) ?? Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((resolve) => {
              release = resolve;
            });
            lockQueues.set(
              key,
              previous.then(() => mine),
            );
            held.push(release);
            await previous;
          }),
      } as unknown as DatabaseAdapter;
      try {
        return await callback(tx);
      } finally {
        for (const release of held) release();
      }
    }),
  };
  return { db: db as unknown as DatabaseAdapter, rows, listLimits };
}

const COMMENT = {
  userId: USER_ID,
  artifactId: ARTIFACT_ID,
  anchor: { kind: 'artifact' as const },
  author: 'user' as const,
};

describe('createArtifactComment admission', () => {
  it('admits exactly one of two overlapping creates at one below the cap', async () => {
    const { db, rows } = makeStore(MAX_COMMENTS_PER_ARTIFACT - 1);

    const results = await Promise.allSettled([
      createArtifactComment(db, { ...COMMENT, body: 'first' }),
      createArtifactComment(db, { ...COMMENT, body: 'second' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.filter((result) => result.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(ArtifactCommentLimitError);
    expect(rows).toHaveLength(MAX_COMMENTS_PER_ARTIFACT);
  });

  it('refuses a create at the cap', async () => {
    const { db, rows } = makeStore(MAX_COMMENTS_PER_ARTIFACT);

    await expect(createArtifactComment(db, { ...COMMENT, body: 'late' })).rejects.toBeInstanceOf(
      ArtifactCommentLimitError,
    );
    expect(rows).toHaveLength(MAX_COMMENTS_PER_ARTIFACT);
  });

  it('refuses to admit when the transaction is not read committed', async () => {
    const { db, rows } = makeStore(0, 'repeatable read');

    await expect(createArtifactComment(db, { ...COMMENT, body: 'x' })).rejects.toThrow(
      /read committed/,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('listArtifactComments', () => {
  it('returns every stored comment, including rows past the cap from earlier races', async () => {
    const { db, listLimits } = makeStore(MAX_COMMENTS_PER_ARTIFACT + 1);

    const comments = await listArtifactComments(db, { userId: USER_ID, artifactId: ARTIFACT_ID });

    expect(comments).toHaveLength(MAX_COMMENTS_PER_ARTIFACT + 1);
    expect(listLimits).toEqual([undefined]);
  });
});
