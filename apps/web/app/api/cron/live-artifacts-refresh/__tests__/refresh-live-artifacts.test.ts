import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  liveArtifactMissingConnectors: vi.fn(),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  LIVE_ARTIFACT_REFRESH_BATCH,
  LIVE_ARTIFACT_REFRESH_BUDGET_MS,
  refreshLiveArtifacts,
} from '../refresh-live-artifacts';

interface Claimed {
  user_id: string;
  artifact_id: string;
  connectors: string[];
}

function fakeDb(claimed: Claimed[]) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) =>
    sql.includes('for update skip locked') ? claimed : [],
  );
  const execute = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

const ROWS: Claimed[] = [
  { user_id: 'user-1', artifact_id: 'a1', connectors: ['google_drive'] },
  { user_id: 'user-2', artifact_id: 'a2', connectors: ['slack', 'linear'] },
  { user_id: 'user-3', artifact_id: 'a3', connectors: ['github'] },
];

describe('refreshLiveArtifacts', () => {
  let clock: number;
  beforeEach(() => {
    clock = 0;
  });

  it('claims a bounded batch under a lease, skipping rows another run holds', async () => {
    const { db, query } = fakeDb([]);
    await refreshLiveArtifacts(db, { missingConnectors: vi.fn(), now: () => clock });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('next_check_at <= now()');
    expect(params[0]).toBe(LIVE_ARTIFACT_REFRESH_BATCH);
    expect(params[1]).toBe('15 minutes');
  });

  it('records which bound apps are missing, and only for the binding it checked', async () => {
    const { db, execute } = fakeDb(ROWS);
    const missingConnectors = vi.fn(async ({ userId }: { userId: string }) =>
      userId === 'user-2' ? ['linear'] : [],
    );
    const failing = vi.fn(async (input: { userId: string; connectors: readonly string[] }) => {
      if (input.userId === 'user-3') throw new Error('directory down');
      return missingConnectors(input);
    });

    const summary = await refreshLiveArtifacts(db, {
      missingConnectors: failing as never,
      now: () => clock,
    });

    expect(summary).toEqual({ claimed: 3, ready: 1, needsConnection: 1, failed: 1, deferred: 0 });
    const readiness = execute.mock.calls.filter(([sql]) =>
      String(sql).includes('missing_connectors = $3'),
    );
    expect(readiness).toHaveLength(2);
    expect(readiness[1]?.[1]).toEqual([
      'user-2',
      'a2',
      ['linear'],
      '24 hours',
      '6 hours',
      ['slack', 'linear'],
    ]);
    expect(String(readiness[0]?.[0])).toContain('and connectors = $6::text[]');
  });

  it('backs off a failed check exponentially up to a ceiling', async () => {
    const { db, execute } = fakeDb([ROWS[2]!]);
    await refreshLiveArtifacts(db, {
      missingConnectors: vi.fn(async () => {
        throw new Error('timeout');
      }),
      now: () => clock,
    });
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('check_failures = check_failures + 1');
    expect(sql).toContain('power(2, least(check_failures, $5::integer))');
    expect(params).toEqual(['user-3', 'a3', '24 hours', '15 minutes', 7]);
  });

  it('leaves rows to the next run once its time budget is spent', async () => {
    const { db, execute } = fakeDb(ROWS);
    const missingConnectors = vi.fn(async () => {
      clock += LIVE_ARTIFACT_REFRESH_BUDGET_MS + 1;
      return [];
    });
    const summary = await refreshLiveArtifacts(db, { missingConnectors, now: () => clock });
    expect(summary).toMatchObject({ claimed: 3, ready: 1, deferred: 2 });
    expect(missingConnectors).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
