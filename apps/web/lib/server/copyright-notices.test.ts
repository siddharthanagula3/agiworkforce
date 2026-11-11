import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { listCopyrightNotices, parseCopyrightNoticeCursor } from './copyright-notices';

function row(id: string, status: string, pageAt: string) {
  return {
    id,
    reference: `CN-${id.slice(0, 4)}`,
    notice_type: 'copyright',
    reporter_name: 'Reporter',
    reporter_email: 'reporter@example.com',
    reporter_organization: null,
    target_kind: 'conversation-share',
    target_token: 'token',
    target_owner_id: null,
    work_description: 'Work',
    statement: 'Statement',
    status,
    disposition_note: null,
    created_at: '2026-09-01T00:00:00.000Z',
    resolved_at: null,
    page_at: pageAt,
  };
}

function dbReturning(rows: unknown[]) {
  const query = vi.fn(async () => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('listCopyrightNotices', () => {
  it('filters decided notices in the query, before the page limit applies', async () => {
    const { db, query } = dbReturning([]);

    await listCopyrightNotices(db, { filter: 'decided', limit: 100 });

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/\$1 = 'decided' and status <> 'received'/);
    expect(sql).toMatch(/date_trunc\('milliseconds', updated_at\)/);
    expect(params).toEqual(['decided', null, null, 101]);
  });

  it('returns a cursor only when a further page exists', async () => {
    const first = '0f0e0d0c-0b0a-4090-8070-605040302010';
    const second = '1f0e0d0c-0b0a-4090-8070-605040302010';
    const { db } = dbReturning([
      row(first, 'counter_notified', '2026-10-02T00:00:00.000Z'),
      row(second, 'rejected', '2026-10-01T00:00:00.000Z'),
    ]);

    const page = await listCopyrightNotices(db, { filter: 'decided', limit: 1 });

    expect(page.notices.map((notice) => notice.id)).toEqual([first]);
    expect(page.nextCursor).toBe(`2026-10-02T00:00:00.000Z|${first}`);
    expect(parseCopyrightNoticeCursor(page.nextCursor ?? '')).toEqual({
      at: '2026-10-02T00:00:00.000Z',
      id: first,
    });
  });

  it('passes a cursor through as the keyset bound', async () => {
    const { db, query } = dbReturning([
      row('0f0e0d0c-0b0a-4090-8070-605040302010', 'rejected', '2026-10-01T00:00:00.000Z'),
    ]);

    const page = await listCopyrightNotices(db, {
      filter: 'decided',
      before: { at: '2026-10-02T00:00:00.000Z', id: '1f0e0d0c-0b0a-4090-8070-605040302010' },
    });

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([
      'decided',
      '2026-10-02T00:00:00.000Z',
      '1f0e0d0c-0b0a-4090-8070-605040302010',
      101,
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('refuses a cursor it did not issue', () => {
    expect(parseCopyrightNoticeCursor('yesterday')).toBeNull();
    expect(parseCopyrightNoticeCursor('2026-10-02T00:00:00.000Z|not-a-uuid')).toBeNull();
  });
});
