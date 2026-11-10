import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { quietHoursEndFor, heldByQuietHours } from '../quiet-hours-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function database(endTime = '08:00') {
  const query = vi.fn().mockResolvedValue([
    {
      preferences: {
        quietHours: {
          enabled: true,
          days: [6],
          startTime: '22:00',
          endTime,
          timezone: 'America/Chicago',
        },
      },
    },
  ]);
  return { db: { query } as Pick<DatabaseAdapter, 'query'>, query };
}

describe('quiet-hours delivery boundary', () => {
  it.each([
    ['2026-03-08T06:30:00Z', '08:00', '2026-03-08T13:00:00.000Z'],
    ['2026-11-01T05:30:00Z', '08:00', '2026-11-01T14:00:00.000Z'],
    ['2026-03-15T05:30:00Z', '08:00', '2026-03-15T13:00:00.000Z'],
    ['2026-03-08T06:30:45.123Z', '08:00', '2026-03-08T13:00:00.000Z'],
    ['2026-03-08T06:30:00Z', '02:30', '2026-03-08T08:00:00.000Z'],
    ['2026-11-01T05:30:00Z', '01:30', '2026-11-01T06:30:00.000Z'],
    ['2026-11-01T07:10:00Z', '01:30', '2026-11-01T07:30:00.000Z'],
  ])('releases %s at the saved local end %s', async (now, endTime, expected) => {
    const { db, query } = database(endTime);
    const end = await quietHoursEndFor(db, 'owner', new Date(now));
    expect(end?.toISOString()).toBe(expected);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.any(String), ['owner', 'time-focus']);
  });

  it('reads saved preferences once for an ordinary push hold', async () => {
    const { db, query } = database();
    expect(
      await heldByQuietHours(db, 'owner', 'task_completed', new Date('2026-03-08T06:30Z')),
    ).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('never delays an urgent notice and does not read preferences for it', async () => {
    const { db, query } = database();
    expect(
      await quietHoursEndFor(
        db,
        'owner',
        new Date('2026-03-08T06:30:00Z'),
        'agent_approval_needed',
      ),
    ).toBeNull();
    expect(
      await quietHoursEndFor(db, 'owner', new Date('2026-03-08T06:30:00Z'), 'agent_failed'),
    ).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps urgent failures exempt without reading preferences', async () => {
    const { db, query } = database();
    expect(await heldByQuietHours(db, 'owner', 'agent_failed', new Date('2026-03-08T06:30Z'))).toBe(
      false,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
