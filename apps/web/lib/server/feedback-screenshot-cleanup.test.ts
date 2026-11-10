import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  deletePrivateObject: vi.fn(),
  storageConfigured: vi.fn(() => true),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));
vi.mock('@/lib/server/object-storage', () => ({
  deletePrivateObject: mocks.deletePrivateObject,
  isPrivateObjectStorageConfigured: mocks.storageConfigured,
}));

import {
  CLEAR_FEEDBACK_SCREENSHOT_SQL,
  FEEDBACK_SCREENSHOT_SWEEP_GRACE_MINUTES,
  sweepAbandonedFeedbackScreenshots,
} from './feedback-screenshot-cleanup';

const query = vi.fn();
const execute = vi.fn();
const db = { query, execute } as unknown as DatabaseAdapter;

const keys = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ storage_key: `feedback/user-1/${index}_a.png` }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageConfigured.mockReturnValue(true);
  mocks.deletePrivateObject.mockResolvedValue(undefined);
  query.mockResolvedValue([]);
  execute.mockResolvedValue(1);
});

describe('sweepAbandonedFeedbackScreenshots', () => {
  it('reads only records older than the grace period, oldest first', async () => {
    await sweepAbandonedFeedbackScreenshots(db);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.feedback_screenshot_cleanups');
    expect(sql).toContain('created_at < now() - make_interval(mins => $1)');
    expect(sql).toContain('order by created_at');
    expect(params[0]).toBe(FEEDBACK_SCREENSHOT_SWEEP_GRACE_MINUTES);
  });

  it('deletes the object and then its record for each abandoned screenshot', async () => {
    query.mockResolvedValue(keys(2));

    expect(await sweepAbandonedFeedbackScreenshots(db)).toEqual({
      swept: 2,
      failed: 0,
      remaining: false,
    });
    expect(mocks.deletePrivateObject.mock.calls).toEqual([
      ['feedback/user-1/0_a.png'],
      ['feedback/user-1/1_a.png'],
    ]);
    expect(execute.mock.calls).toEqual([
      [CLEAR_FEEDBACK_SCREENSHOT_SQL, ['feedback/user-1/0_a.png']],
      [CLEAR_FEEDBACK_SCREENSHOT_SQL, ['feedback/user-1/1_a.png']],
    ]);
    expect(mocks.deletePrivateObject.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0] as number,
    );
  });

  it('keeps the record of an object it could not delete, so the next run tries again', async () => {
    query.mockResolvedValue(keys(2));
    mocks.deletePrivateObject.mockRejectedValueOnce(new Error('storage down'));

    expect(await sweepAbandonedFeedbackScreenshots(db)).toEqual({
      swept: 1,
      failed: 1,
      remaining: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(CLEAR_FEEDBACK_SCREENSHOT_SQL, [
      'feedback/user-1/1_a.png',
    ]);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'feedback/user-1/0_a.png' }),
      expect.stringContaining('retried on the next run'),
    );
  });

  it('counts a record it could not clear as failed rather than swept', async () => {
    query.mockResolvedValue(keys(1));
    execute.mockRejectedValueOnce(new Error('connection reset'));

    expect(await sweepAbandonedFeedbackScreenshots(db)).toEqual({
      swept: 0,
      failed: 1,
      remaining: false,
    });
  });

  it('stops at the limit and says more remain', async () => {
    query.mockResolvedValue(keys(3));

    expect(await sweepAbandonedFeedbackScreenshots(db, 2)).toEqual({
      swept: 2,
      failed: 0,
      remaining: true,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([FEEDBACK_SCREENSHOT_SWEEP_GRACE_MINUTES, 3]);
    expect(mocks.deletePrivateObject).toHaveBeenCalledTimes(2);
  });

  it('deletes nothing and keeps every record when private storage is not configured', async () => {
    query.mockResolvedValue(keys(2));
    mocks.storageConfigured.mockReturnValue(false);

    expect(await sweepAbandonedFeedbackScreenshots(db)).toEqual({
      swept: 0,
      failed: 2,
      remaining: false,
    });
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('touches nothing when no record is due', async () => {
    expect(await sweepAbandonedFeedbackScreenshots(db)).toEqual({
      swept: 0,
      failed: 0,
      remaining: false,
    });
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
