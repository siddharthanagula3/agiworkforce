import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: mockLoggerError, warn: vi.fn(), debug: vi.fn() },
}));

import { purgeSoftDeletedResources } from '../purge-soft-deleted';

function adapter(query: (sql: string, params: unknown[]) => Promise<unknown[]>): DatabaseAdapter {
  return {
    query: query as DatabaseAdapter['query'],
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

function tableOf(sql: string): string {
  return /delete from public\.(\w+)/u.exec(sql)?.[1] ?? '';
}

/** The count of what a hold withheld is a read; only the deletes are ordered. */
function isDelete(sql: string): boolean {
  return /delete from public\./u.test(sql);
}

describe('purgeSoftDeletedResources', () => {
  it('purges a child table before the parent whose cascade would take it', async () => {
    const order: string[] = [];
    await purgeSoftDeletedResources(
      adapter(async (sql) => {
        if (isDelete(sql)) order.push(tableOf(sql));
        return [];
      }),
    );

    expect(order).toContain('web_conversations');
    expect(order.indexOf('web_messages')).toBeLessThan(order.indexOf('web_conversations'));
    expect(order.indexOf('web_artifacts')).toBeLessThan(order.indexOf('web_conversations'));
  });

  it('issues a statement for each purgeable table exactly once', async () => {
    const order: string[] = [];
    const result = await purgeSoftDeletedResources(
      adapter(async (sql) => {
        if (isDelete(sql)) order.push(tableOf(sql));
        return [];
      }),
    );

    expect(new Set(order).size).toBe(order.length);
    expect(result.tables).toHaveLength(6);
    expect(order).toEqual(['web_messages', 'web_artifacts', 'web_conversations']);
  });

  it('refuses to delete a row that is the only address of an object in storage', async () => {
    const issued: string[] = [];
    const result = await purgeSoftDeletedResources(
      adapter(async (sql) => {
        if (isDelete(sql)) issued.push(tableOf(sql));
        return [];
      }),
    );

    expect(issued).not.toContain('media_assets');
    expect(issued).not.toContain('project_knowledge_files');
    // A project cascades to its knowledge files, so purging it would orphan
    // their bytes just as directly.
    expect(issued).not.toContain('user_projects');
    expect(result.skipped).toBe(3);

    const media = result.tables.find((entry) => entry.table === 'media_assets');
    expect(media?.skippedReason).toContain('cron/purge-deleted-media');

    const knowledge = result.tables.find((entry) => entry.table === 'project_knowledge_files');
    expect(knowledge?.skippedReason).toContain('no sweep deletes those objects yet');

    const project = result.tables.find((entry) => entry.table === 'user_projects');
    expect(project?.skippedReason).toContain('project_knowledge_files');
  });

  it('bounds each statement and only takes rows past the window', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    await purgeSoftDeletedResources(
      adapter(async (sql, params) => {
        calls.push({ sql, params });
        return [];
      }),
    );

    const deletes = calls.filter((call) => isDelete(call.sql));
    expect(deletes.length).toBeGreaterThan(0);
    for (const call of deletes) {
      expect(call.sql).toContain('deleted_at < now() - $1::interval');
      expect(call.sql).toContain('limit $2');
      expect(call.params[0]).toBe('30 days');
      expect(typeof call.params[1]).toBe('number');
    }

    // Every one of these tables can be placed under legal hold, so every
    // statement carries the predicate and binds the store it is reading.
    const store: Record<string, string> = {
      web_conversations: 'conversation',
      web_messages: 'message',
      web_artifacts: 'artifact',
    };
    for (const call of calls) {
      const table = tableOf(call.sql) || /from public\.(\w+) candidate/u.exec(call.sql)?.[1] || '';
      expect(call.sql).toContain('legal_hold_custodians');
      expect(call.params).toContain(store[table]);
    }
  });

  it('counts what it removed', async () => {
    const result = await purgeSoftDeletedResources(
      adapter(async (sql) =>
        tableOf(sql) === 'web_artifacts' ? [{ purge_key: 'a' }, { purge_key: 'b' }] : [],
      ),
    );

    expect(result.purged).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.tables.find((entry) => entry.table === 'web_artifacts')?.purged).toBe(2);
  });

  it('keeps sweeping when one table fails, and reports the failure', async () => {
    mockLoggerError.mockClear();
    const result = await purgeSoftDeletedResources(
      adapter(async (sql) => {
        if (tableOf(sql) === 'web_messages') throw new Error('relation is locked');
        return [{ purge_key: 'x' }];
      }),
    );

    expect(result.failed).toBe(1);
    expect(result.purged).toBe(2);
    expect(result.tables.find((entry) => entry.table === 'web_messages')?.error).toBe(
      'relation is locked',
    );
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});
