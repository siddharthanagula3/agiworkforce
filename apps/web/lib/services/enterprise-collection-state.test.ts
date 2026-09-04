import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type QueryDb = Pick<DatabaseAdapter, 'query'>;

function dbReturning(rows: unknown[]): QueryDb & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const query = (async (_sql: string, params?: unknown[]) => {
    calls.push(params ?? []);
    return rows;
  }) as unknown as QueryDb['query'];
  return { query, calls };
}

function dbThrowing(error: Error): QueryDb {
  const query = (async () => {
    throw error;
  }) as unknown as QueryDb['query'];
  return { query };
}

import {
  CURRENT_COLLECTION_STATE,
  deriveCollectionState,
  readOrganizationCollectionState,
} from './enterprise-collection-state';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

function dueDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

describe('deriveCollectionState', () => {
  it('is current with no open invoice or a future due date', () => {
    expect(deriveCollectionState(NOW, null).stage).toBe('current');
    expect(deriveCollectionState(NOW, dueDaysAgo(-3)).stage).toBe('current');
    expect(deriveCollectionState(NOW, dueDaysAgo(-3)).daysPastDue).toBe(0);
  });

  it.each([
    [1, 'past_due_30'],
    [30, 'past_due_30'],
    [31, 'past_due_60'],
    [60, 'past_due_60'],
    [61, 'past_due_90'],
    [90, 'past_due_90'],
    [91, 'read_only'],
    [400, 'read_only'],
  ] as const)('maps %s days past due to %s', (days, stage) => {
    const state = deriveCollectionState(NOW, dueDaysAgo(days));
    expect(state.stage).toBe(stage);
    expect(state.daysPastDue).toBe(days);
  });

  it('blocks seat expansion and new paid usage only from day 61', () => {
    expect(deriveCollectionState(NOW, dueDaysAgo(60)).seatExpansionBlocked).toBe(false);
    expect(deriveCollectionState(NOW, dueDaysAgo(61)).seatExpansionBlocked).toBe(true);
    expect(deriveCollectionState(NOW, dueDaysAgo(61)).newPaidUsageBlocked).toBe(true);
    expect(deriveCollectionState(NOW, dueDaysAgo(61)).readOnly).toBe(false);
  });

  it('turns read-only only after day 90', () => {
    expect(deriveCollectionState(NOW, dueDaysAgo(90)).readOnly).toBe(false);
    expect(deriveCollectionState(NOW, dueDaysAgo(91)).readOnly).toBe(true);
  });

  it('treats an unparseable due date as current', () => {
    expect(deriveCollectionState(NOW, 'not a date')).toEqual(CURRENT_COLLECTION_STATE);
  });
});

describe('readOrganizationCollectionState', () => {
  it('reads the oldest open invoice due date for the organization', async () => {
    const db = dbReturning([{ oldest_open_invoice_due_at: dueDaysAgo(45) }]);
    const state = await readOrganizationCollectionState(db, 'org-1', NOW);
    expect(state.stage).toBe('past_due_60');
    expect(db.calls[0]).toEqual(['org-1']);
  });

  it('is current when the organization has no contract row', async () => {
    expect(await readOrganizationCollectionState(dbReturning([]), 'org-1', NOW)).toEqual(
      CURRENT_COLLECTION_STATE,
    );
  });

  it('is current when the contract schema is absent', async () => {
    const db = dbThrowing(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    expect(await readOrganizationCollectionState(db, 'org-1', NOW)).toEqual(
      CURRENT_COLLECTION_STATE,
    );
  });

  it('rethrows any other database error', async () => {
    const db = dbThrowing(new Error('connection reset'));
    await expect(readOrganizationCollectionState(db, 'org-1', NOW)).rejects.toThrow(
      'connection reset',
    );
  });
});
