import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { insertNotification, listNotifications, recordNotification } =
  await import('../notification-service');
const { decodeKeysetCursor } = await import('@/lib/identity/pagination');

const query = vi.fn();
const db = { query, execute: vi.fn() } as unknown as DatabaseAdapter;

beforeEach(() => {
  query.mockReset();
});

describe('recordNotification', () => {
  it('writes one idempotent feed row carrying the category, severity and target', async () => {
    query.mockResolvedValue([{ id: 'row-1' }]);

    await expect(
      recordNotification(db, {
        userId: 'user-1',
        category: 'schedule',
        severity: 'error',
        title: 'Scheduled task failed',
        message: '“Weekly digest” failed.',
        target: { kind: 'schedule', id: 'task-1' },
        dedupeKey: 'schedule-run:run-1',
      }),
    ).resolves.toEqual({ recorded: true, failed: false });

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain(
      'on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing',
    );
    expect(params).toEqual([
      'user-1',
      'schedule',
      'error',
      'Scheduled task failed',
      '“Weekly digest” failed.',
      'schedule',
      'task-1',
      'schedule-run:run-1',
    ]);
  });

  it('reports a duplicate event as not recorded', async () => {
    query.mockResolvedValue([]);
    const result = await recordNotification(db, {
      userId: 'user-1',
      category: 'research',
      severity: 'success',
      title: 'Research report ready',
      message: 'Done.',
      dedupeKey: 'research:req-1',
    });
    expect(result).toEqual({ recorded: false, failed: false });
  });

  it('drops a target no surface can open rather than storing a dead link', async () => {
    query.mockResolvedValue([{ id: 'row-1' }]);
    await recordNotification(db, {
      userId: 'user-1',
      category: 'general',
      severity: 'info',
      title: 'Hello',
      message: '',
      target: { kind: 'settings', id: 'not-a-section' },
    });
    const params = query.mock.calls[0]![1] as unknown[];
    expect(params.slice(5, 7)).toEqual([null, null]);
  });

  it('never throws when the database refuses the write, so the caller’s delivery still runs', async () => {
    query.mockRejectedValue(new Error('relation does not exist'));
    await expect(
      recordNotification(db, {
        userId: 'user-1',
        category: 'billing',
        severity: 'warning',
        title: 'Payment failed',
        message: 'Update your card.',
      }),
    ).resolves.toEqual({ recorded: false, failed: true });
  });

  it('skips a row with no owner or no title', async () => {
    await expect(
      recordNotification(db, {
        userId: ' ',
        category: 'general',
        severity: 'info',
        title: 'x',
        message: '',
      }),
    ).resolves.toEqual({ recorded: false, failed: false });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('insertNotification', () => {
  const notice = {
    userId: 'user-1',
    category: 'billing' as const,
    severity: 'info' as const,
    title: 'Paid upgrades are open',
    message: 'You can upgrade now.',
    dedupeKey: 'upgrade-waitlist-open:user-1',
  };

  it('tells a new row from one an earlier write already left', async () => {
    query.mockResolvedValueOnce([{ id: 'row-1' }]).mockResolvedValueOnce([]);

    await expect(insertNotification(db, notice)).resolves.toBe('inserted');
    await expect(insertNotification(db, notice)).resolves.toBe('duplicate');
  });

  it('lets a refused write reach the caller instead of reporting it as written', async () => {
    query.mockRejectedValue(new Error('statement timeout'));

    await expect(insertNotification(db, notice)).rejects.toThrow('statement timeout');
  });

  it('writes nothing for a row with no owner', async () => {
    await expect(insertNotification(db, { ...notice, userId: ' ' })).resolves.toBe('invalid');
    expect(query).not.toHaveBeenCalled();
  });
});

interface FeedRow {
  id: string;
  created_at: string;
}

function feedRowId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function feedDb(table: readonly FeedRow[]) {
  const sorted = [...table].sort((a, b) =>
    a.created_at === b.created_at
      ? b.id.localeCompare(a.id)
      : b.created_at.localeCompare(a.created_at),
  );
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('count(*)')) return [{ unread: String(table.length) }];
    const limit = params.at(-1) as number;
    let rows = sorted;
    if (sql.includes('(created_at, id) <')) {
      const [, sortValue, id] = params as [string, string, string];
      rows = rows.filter(
        (row) =>
          row.created_at < sortValue ||
          (row.created_at === sortValue && row.id.localeCompare(id) < 0),
      );
    } else if (sql.includes("interval '1 millisecond'")) {
      const before = new Date(params[1] as string).getTime() + 1;
      rows = rows.filter((row) => new Date(row.created_at).getTime() < before);
    }
    return rows.slice(0, limit).map((row) => ({
      id: row.id,
      category: 'general',
      type: 'info',
      title: 'Title',
      message: 'Message',
      target_kind: null,
      target_id: null,
      is_read: false,
      created_at: new Date(row.created_at),
      page_sort_key: row.created_at,
    }));
  });
}

describe('listNotifications paging', () => {
  const tied = '2026-09-29T10:00:00.123456Z';
  const table: FeedRow[] = [
    ...Array.from({ length: 28 }, (_, index) => ({
      id: feedRowId(100 + index),
      created_at: `2026-09-29T11:${String(59 - index).padStart(2, '0')}:00.000000Z`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: feedRowId(index + 1), created_at: tied })),
    { id: feedRowId(200), created_at: '2026-09-29T09:00:00.000000Z' },
  ];

  it('returns every row exactly once when a page boundary falls inside rows sharing a timestamp', async () => {
    feedDb(table);
    const seen: string[] = [];
    let cursor: ReturnType<typeof decodeKeysetCursor> = null;
    for (let pageCount = 0; pageCount < 10; pageCount += 1) {
      const page = await listNotifications(db, 'user-1', { limit: 30, cursor });
      seen.push(...page.notifications.map((item) => item.id));
      if (!page.nextCursor) break;
      cursor = decodeKeysetCursor(page.nextCursor);
      expect(cursor).not.toBeNull();
    }
    expect(seen).toHaveLength(table.length);
    expect(new Set(seen).size).toBe(table.length);
    expect(seen.slice(28, 33)).toEqual([5, 4, 3, 2, 1].map(feedRowId));
  });

  it('orders by the timestamp then the id and carries the full-precision timestamp in the cursor', async () => {
    feedDb(table);
    const page = await listNotifications(db, 'user-1', { limit: 30 });
    const [sql, params] = query.mock.calls.find(([text]) => !text.includes('count(*)'))!;
    expect(sql).toContain('order by created_at desc, id desc');
    expect(params).toEqual(['user-1', 31]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeKeysetCursor(page.nextCursor)).toEqual({ sortValue: tied, id: feedRowId(4) });
  });

  it('reports no cursor on the final page', async () => {
    feedDb(table);
    const last = await listNotifications(db, 'user-1', {
      limit: 30,
      cursor: { sortValue: tied, id: feedRowId(1) },
    });
    expect(last.notifications.map((item) => item.id)).toEqual([feedRowId(200)]);
    expect(last.nextCursor).toBeNull();
  });

  it('still honours the old timestamp-only cursor without skipping a tied row', async () => {
    feedDb(table);
    const page = await listNotifications(db, 'user-1', {
      limit: 30,
      before: '2026-09-29T10:00:00.123Z',
    });
    const ids = page.notifications.map((item) => item.id);
    for (let index = 1; index <= 5; index += 1) expect(ids).toContain(feedRowId(index));
    expect(ids).toContain(feedRowId(200));
    const [sql] = query.mock.calls.find(([text]) => !text.includes('count(*)'))!;
    expect(sql).toContain("created_at < $2::timestamptz + interval '1 millisecond'");
  });
});
