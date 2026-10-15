import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { insertNotification, recordNotification } = await import('../notification-service');

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
    ).resolves.toEqual({ recorded: true });

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
    expect(result).toEqual({ recorded: false });
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
    ).resolves.toEqual({ recorded: false });
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
    ).resolves.toEqual({ recorded: false });
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
