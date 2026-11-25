import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getSharedSchedule } from './schedule-share-service';

describe('getSharedSchedule', () => {
  it('only resolves a share that is live and still attached to a schedule', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = { query } as unknown as DatabaseAdapter;

    await expect(getSharedSchedule(db, 'A'.repeat(24))).resolves.toBeNull();

    const sql = String(query.mock.calls[0]?.[0]);
    const where = sql.slice(sql.indexOf('where'));
    expect(where.replace(/\s+/g, ' ')).toContain(
      'where token = $1 and revoked_at is null and task_id is not null',
    );
  });
});
