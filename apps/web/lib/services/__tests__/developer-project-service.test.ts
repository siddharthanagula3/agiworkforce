import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { DEVELOPER_PROJECT_LIMIT, createDeveloperProject } from '../developer-project-service';

const USER_ID = 'user-1';

interface Row {
  id: string;
  name: string;
  monthly_credit_limit: number | null;
  archived_at: null;
  created_at: string;
}

function createFakeDatabase(initialLive: number) {
  const rows: Row[] = Array.from({ length: initialLive }, (_, index) => ({
    id: `seed-${index}`,
    name: `Seed ${index}`,
    monthly_credit_limit: null,
    archived_at: null,
    created_at: '2026-11-09T00:00:00.000Z',
  }));
  const statements: string[] = [];
  let ownerLockTail: Promise<void> = Promise.resolve();

  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function transactionAdapter(releaseOnEnd: Array<() => void>): DatabaseAdapter {
    return {
      query: async (sql: string, params: unknown[] = []) => {
        statements.push(sql);
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = ownerLockTail;
          let release!: () => void;
          ownerLockTail = new Promise<void>((resolve) => {
            release = resolve;
          });
          releaseOnEnd.push(release);
          await previous;
          return [{ locked: true }];
        }
        if (sql.includes('count(*)')) {
          const live = rows.length;
          await settle();
          return [{ live }];
        }
        if (sql.includes('insert into public.developer_projects')) {
          const name = String(params[1]);
          if (rows.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
            throw Object.assign(new Error('duplicate key'), { code: '23505' });
          }
          const row: Row = {
            id: `new-${rows.length}`,
            name,
            monthly_credit_limit: (params[2] as number | null) ?? null,
            archived_at: null,
            created_at: '2026-11-09T00:00:01.000Z',
          };
          rows.push(row);
          return [row];
        }
        throw new Error(`unexpected statement: ${sql}`);
      },
      execute: async () => 0,
      transaction: async () => {
        throw new Error('nested transactions are not supported');
      },
    } as unknown as DatabaseAdapter;
  }

  const db = {
    query: async () => {
      throw new Error('create must run inside one transaction');
    },
    execute: async () => 0,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
      const releases: Array<() => void> = [];
      try {
        return await fn(transactionAdapter(releases));
      } finally {
        for (const release of releases) release();
      }
    },
  } as unknown as DatabaseAdapter;

  return { db, rows, statements };
}

describe('createDeveloperProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admits exactly one of two concurrent creates at the project limit minus one', async () => {
    const { db, rows } = createFakeDatabase(DEVELOPER_PROJECT_LIMIT - 1);

    const results = await Promise.allSettled([
      createDeveloperProject(db, USER_ID, { name: 'Tab A', monthlyCreditLimit: null }),
      createDeveloperProject(db, USER_ID, { name: 'Tab B', monthlyCreditLimit: null }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result) => result.status === 'rejected');
    expect(refused).toMatchObject({
      reason: { message: expect.stringContaining(`${DEVELOPER_PROJECT_LIMIT} projects`) },
    });
    expect(rows).toHaveLength(DEVELOPER_PROJECT_LIMIT);
  });

  it('admits both concurrent creates while the owner stays under the limit', async () => {
    const { db, rows } = createFakeDatabase(DEVELOPER_PROJECT_LIMIT - 2);

    const results = await Promise.allSettled([
      createDeveloperProject(db, USER_ID, { name: 'Tab A', monthlyCreditLimit: null }),
      createDeveloperProject(db, USER_ID, { name: 'Tab B', monthlyCreditLimit: 5 }),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(rows).toHaveLength(DEVELOPER_PROJECT_LIMIT);
  });

  it('takes the owner lock before counting and inserting', async () => {
    const { db, statements } = createFakeDatabase(0);

    await createDeveloperProject(db, USER_ID, { name: ' Alpha ', monthlyCreditLimit: null });

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('pg_advisory_xact_lock');
    expect(statements[1]).toContain('count(*)');
    expect(statements[2]).toContain('insert into public.developer_projects');
  });

  it('refuses a create at the limit without inserting', async () => {
    const { db, rows, statements } = createFakeDatabase(DEVELOPER_PROJECT_LIMIT);

    await expect(
      createDeveloperProject(db, USER_ID, { name: 'Over', monthlyCreditLimit: null }),
    ).rejects.toThrow(`${DEVELOPER_PROJECT_LIMIT} projects`);

    expect(rows).toHaveLength(DEVELOPER_PROJECT_LIMIT);
    expect(statements.some((sql) => sql.includes('insert into'))).toBe(false);
  });

  it('reports a duplicate name as a conflict', async () => {
    const { db } = createFakeDatabase(1);

    await expect(
      createDeveloperProject(db, USER_ID, { name: 'seed 0', monthlyCreditLimit: null }),
    ).rejects.toThrow('You already have a project named seed 0.');
  });
});
