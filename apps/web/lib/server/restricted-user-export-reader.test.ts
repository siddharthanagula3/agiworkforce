import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import {
  readRestrictedUserExportSections,
  RESTRICTED_USER_EXPORT_SECTIONS,
} from './restricted-user-export-reader';

const USER_ID = 'user_export';

describe('restricted user export reader', () => {
  it('exposes only the reviewed restricted sections and binds every read to the authenticated user', async () => {
    const calls: Array<[string, unknown[] | undefined]> = [];
    const query: DatabaseAdapter['query'] = async <T>(sql: string, values?: unknown[]) => {
      calls.push([sql, values]);
      return [] as T[];
    };
    const results = await readRestrictedUserExportSections(
      createDatabaseAdapterFake({ query }),
      USER_ID,
    );

    expect(RESTRICTED_USER_EXPORT_SECTIONS).toEqual([
      'product_analytics_events',
      'support_handoff_sessions',
      'authentication_attempts',
    ]);
    expect(results.map(({ section }) => section)).toEqual(RESTRICTED_USER_EXPORT_SECTIONS);
    expect(calls).toHaveLength(3);
    for (const [sql, values] of calls) {
      expect(values).toEqual([USER_ID]);
      expect(sql).toMatch(/where (?:user_id|owner_user_id) = \$1/);
    }
  });

  it('validates privileged rows before adding them to the export', async () => {
    const results = await readRestrictedUserExportSections(
      createDatabaseAdapterFake({
        query: (async <T>(sql: string) => {
          if (!sql.includes('product_analytics_events')) return [];
          return [
            {
              event_name: 'chat_sent',
              surface: 'web',
              outcome: 'success',
              properties: {},
              occurred_at: new Date('2026-09-19T00:00:00.000Z'),
            },
            { event_name: 42 },
          ] as T[];
        }) as DatabaseAdapter['query'],
      }),
      USER_ID,
    );

    expect(results[0]).toMatchObject({
      section: 'product_analytics_events',
      rows: [
        {
          event_name: 'chat_sent',
          surface: 'web',
          outcome: 'success',
          properties: {},
          occurred_at: '2026-09-19T00:00:00.000Z',
        },
      ],
      skippedRows: 1,
      truncated: false,
    });
  });

  it('isolates a restricted-table failure so completeness can name the unavailable section', async () => {
    const results = await readRestrictedUserExportSections(
      createDatabaseAdapterFake({
        query: (async <T>(sql: string) => {
          if (sql.includes('support_handoff_sessions')) throw new Error('permission denied');
          return [] as T[];
        }) as DatabaseAdapter['query'],
      }),
      USER_ID,
    );

    expect(results.find(({ section }) => section === 'support_handoff_sessions')).toMatchObject({
      rows: [],
      skippedRows: 0,
      truncated: false,
      error: expect.any(Error),
    });
  });

  it('keeps app_rls denied while the narrow service reader owns the only exceptions', () => {
    const reader = readFileSync(
      join(process.cwd(), 'lib/server/restricted-user-export-reader.ts'),
      'utf8',
    );
    const tableReferences = [...reader.matchAll(/from public\.([a-z_][a-z0-9_]*)/g)].map(
      (match) => match[1],
    );

    expect(tableReferences).toEqual([
      'product_analytics_events',
      'support_handoff_sessions',
      'authentication_attempts',
    ]);
    expect(
      readFileSync(join(process.cwd(), 'db/neon/0089_support_live_handoff.sql'), 'utf8'),
    ).toMatch(/revoke all on public\.support_handoff_sessions from app_rls/i);
    expect(
      readFileSync(join(process.cwd(), 'db/neon/0213_product_analytics_events.sql'), 'utf8'),
    ).toMatch(/revoke all on public\.product_analytics_events from app_rls/i);
    expect(
      readFileSync(
        join(process.cwd(), 'db/neon/0251_authentication_and_search_outcomes.sql'),
        'utf8',
      ),
    ).toMatch(/revoke all on public\.authentication_attempts from app_rls/i);
  });
});
