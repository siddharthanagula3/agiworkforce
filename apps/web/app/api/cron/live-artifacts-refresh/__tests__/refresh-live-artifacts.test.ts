import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/artifact-runtime-service', () => ({
  liveArtifactMissingConnectors: vi.fn(),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { UNATTENDED_RUN_DENIED_STATUSES } from '@/lib/auth/account-lifecycle';
import {
  LIVE_ARTIFACT_REFRESH_BATCH,
  LIVE_ARTIFACT_REFRESH_BUDGET_MS,
  refreshLiveArtifacts,
} from '../refresh-live-artifacts';

interface Claimed {
  user_id: string;
  artifact_id: string;
  connectors: string[];
  organization_id: string | null;
  may_check: boolean;
}

function fakeDb(claimed: Claimed[]) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) =>
    sql.includes('for update skip locked') ? claimed : [],
  );
  const execute = vi.fn(async (_sql: string, _params?: unknown[]) => undefined);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

const ORG_ID = 'c0ffee00-0000-4000-8000-0000000000cc';

const ROWS: Claimed[] = [
  {
    user_id: 'user-1',
    artifact_id: 'a1',
    connectors: ['google_drive'],
    organization_id: null,
    may_check: true,
  },
  {
    user_id: 'user-2',
    artifact_id: 'a2',
    connectors: ['slack', 'linear'],
    organization_id: ORG_ID,
    may_check: true,
  },
  {
    user_id: 'user-3',
    artifact_id: 'a3',
    connectors: ['github'],
    organization_id: null,
    may_check: true,
  },
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
    expect(params[2]).toEqual(UNATTENDED_RUN_DENIED_STATUSES);
    expect(sql).toContain('as organization_id');
    expect(sql).toContain('conversations.deleted_at is null');
    expect(sql).toContain("members.status = 'active'");
    expect(sql).toContain('profile.account_status = any($3::text[])');
    expect(sql).toContain('public.erasure_tombstones');
  });

  it('checks each binding under the workspace its chat belongs to', async () => {
    const { db } = fakeDb([ROWS[1]!]);
    const missingConnectors = vi.fn(async () => []);
    await refreshLiveArtifacts(db, { missingConnectors, now: () => clock });
    expect(missingConnectors).toHaveBeenCalledWith({
      db,
      userId: 'user-2',
      organizationId: ORG_ID,
      connectors: ['slack', 'linear'],
    });
  });

  it('dials no connected app for a shut account or a chat it can no longer reach', async () => {
    const { db, execute } = fakeDb([{ ...ROWS[0]!, may_check: false }]);
    const missingConnectors = vi.fn(async () => []);
    const summary = await refreshLiveArtifacts(db, { missingConnectors, now: () => clock });
    expect(missingConnectors).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ claimed: 1, skipped: 1, ready: 0, failed: 0 });
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('missing_connectors');
    expect(sql).toContain('next_check_at = now() + $3::interval');
    expect(params).toEqual(['user-1', 'a1', '24 hours']);
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

    expect(summary).toEqual({
      claimed: 3,
      ready: 1,
      needsConnection: 1,
      failed: 1,
      deferred: 0,
      skipped: 0,
    });
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
