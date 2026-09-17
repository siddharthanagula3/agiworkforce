import { describe, expect, it, vi } from 'vitest';

import {
  CONNECTOR_FAILURE_RECENCY_MS,
  CONNECTOR_FAILURE_STREAK_THRESHOLD,
  connectorsNotResponding,
  readConnectorCallLog,
  readConnectorsNotResponding,
  recordConnectorCallOutcome,
  type ConnectorCallEntry,
} from '@/lib/services/connector-call-log-service';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');

function call(overrides: Partial<ConnectorCallEntry> & { minutesAgo: number }): ConnectorCallEntry {
  const { minutesAgo, ...rest } = overrides;
  return {
    connectorId: 'gmail',
    toolName: 'send',
    outcome: 'failed',
    durationMs: 120,
    occurredAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    ...rest,
  };
}

function fakeDb(rows: unknown[] = [], onQuery?: (sql: string, values: unknown[]) => void) {
  return {
    query: vi.fn(async (sql: string, values: unknown[]) => {
      onQuery?.(sql, values);
      return rows;
    }),
  } as never;
}

describe('connectorsNotResponding', () => {
  it('reports a connector whose recent calls have all failed', () => {
    const down = connectorsNotResponding(
      [call({ minutesAgo: 1 }), call({ minutesAgo: 2 }), call({ minutesAgo: 3 })],
      NOW,
    );
    expect(down).toEqual(new Set(['gmail']));
  });

  it('clears the moment one call succeeds again', () => {
    const down = connectorsNotResponding(
      [
        call({ minutesAgo: 1, outcome: 'succeeded' }),
        call({ minutesAgo: 2 }),
        call({ minutesAgo: 3 }),
        call({ minutesAgo: 4 }),
      ],
      NOW,
    );
    expect(down.size).toBe(0);
  });

  it('needs a run, not a single failure', () => {
    expect(
      connectorsNotResponding([call({ minutesAgo: 1 }), call({ minutesAgo: 2 })], NOW).size,
    ).toBe(0);
    expect(CONNECTOR_FAILURE_STREAK_THRESHOLD).toBeGreaterThan(1);
  });

  it('lets an old streak expire rather than keeping a quiet connector marked down', () => {
    const stale = CONNECTOR_FAILURE_RECENCY_MS / 60_000 + 10;
    const down = connectorsNotResponding(
      [
        call({ minutesAgo: stale }),
        call({ minutesAgo: stale + 1 }),
        call({ minutesAgo: stale + 2 }),
      ],
      NOW,
    );
    expect(down.size).toBe(0);
  });

  it('never counts a call this platform blocked against the provider', () => {
    const down = connectorsNotResponding(
      [
        call({ minutesAgo: 1, outcome: 'blocked' }),
        call({ minutesAgo: 2, outcome: 'blocked' }),
        call({ minutesAgo: 3, outcome: 'blocked' }),
      ],
      NOW,
    );
    expect(down.size).toBe(0);
  });

  it('judges each connector on its own calls', () => {
    const down = connectorsNotResponding(
      [
        call({ minutesAgo: 1 }),
        call({ minutesAgo: 2 }),
        call({ minutesAgo: 3 }),
        call({ minutesAgo: 1, connectorId: 'slack', outcome: 'succeeded' }),
        call({ minutesAgo: 2, connectorId: 'slack', outcome: 'succeeded' }),
        call({ minutesAgo: 3, connectorId: 'slack', outcome: 'succeeded' }),
      ],
      NOW,
    );
    expect(down).toEqual(new Set(['gmail']));
  });
});

describe('readConnectorCallLog', () => {
  it('caps the page size a caller can ask for', async () => {
    let capturedSql = '';
    const db = fakeDb([], (sql) => {
      capturedSql = sql;
    });
    await readConnectorCallLog(db, 'user_1', { limit: 10_000 });
    expect(capturedSql).toContain('limit 100');
  });

  it('degrades to an empty log while the migration is pending', async () => {
    const db = {
      query: vi.fn(async () => {
        throw Object.assign(new Error('relation "connector_call_events" does not exist'), {
          code: '42P01',
        });
      }),
    } as never;
    await expect(readConnectorCallLog(db, 'user_1')).resolves.toEqual([]);
  });
});

describe('readConnectorsNotResponding', () => {
  it('asks only for the window the verdict can use', async () => {
    let values: unknown[] = [];
    const db = fakeDb([], (_sql, passed) => {
      values = passed;
    });
    await readConnectorsNotResponding(db, 'user_1', NOW);
    expect(values[0]).toBe('user_1');
    expect(Date.parse(String(values[1]))).toBe(NOW - CONNECTOR_FAILURE_RECENCY_MS);
  });

  it('leaves every connector on its configured state while the migration is pending', async () => {
    const db = {
      query: vi.fn(async () => {
        throw Object.assign(new Error('does not exist'), { code: '42P01' });
      }),
    } as never;
    await expect(readConnectorsNotResponding(db, 'user_1', NOW)).resolves.toEqual(new Set());
  });
});

describe('recordConnectorCallOutcome', () => {
  it('never lets a failed log line surface as a failed connector call', async () => {
    const db = {
      query: vi.fn(async () => {
        throw new Error('write failed');
      }),
    } as never;
    expect(() =>
      recordConnectorCallOutcome(db, {
        userId: 'user_1',
        connectorId: 'gmail',
        toolName: 'send',
        outcome: 'succeeded',
      }),
    ).not.toThrow();
    await Promise.resolve();
  });

  it('writes nothing without a subject to attribute the call to', () => {
    const query = vi.fn();
    recordConnectorCallOutcome({ query } as never, {
      userId: '',
      connectorId: 'gmail',
      toolName: 'send',
      outcome: 'succeeded',
    });
    expect(query).not.toHaveBeenCalled();
  });
});
