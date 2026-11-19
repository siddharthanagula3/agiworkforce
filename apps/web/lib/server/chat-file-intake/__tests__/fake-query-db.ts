import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { vi } from 'vitest';

export type QueryAnswer = (sql: string, params?: unknown[]) => Promise<unknown[]>;

/**
 * A database that only answers `query`. The row type of `DatabaseAdapter.query` is generic, which a
 * mock cannot keep, so the mock answers untyped rows and the adapter hands them back as the rows the
 * caller asked for.
 */
export function createQueryDb(answer: QueryAnswer) {
  const query = vi.fn(answer);
  const db: Pick<DatabaseAdapter, 'query'> = {
    async query<T = Record<string, unknown>>(
      ...args: Parameters<DatabaseAdapter['query']>
    ): Promise<T[]> {
      return (await query(...args)) as T[];
    },
  };
  return { db, query };
}
