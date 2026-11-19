import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/release-audit-store');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readReleaseEvents: vi.fn(),
  readLatestReleaseEvent: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));

vi.mock('@/lib/server/release-audit-store', async () => {
  const actual = await vi.importActual<ScanModule0>('@/lib/server/release-audit-store');
  return {
    ...actual,
    readReleaseEvents: mocks.readReleaseEvents,
    readLatestReleaseEvent: mocks.readLatestReleaseEvent,
  };
});

import { GENESIS_HASH, type ReleaseEvent } from '@/lib/server/release-audit-store';
import { readReleaseDashboard, readReleaseLedger } from '../release-ledger-service';

const COMMIT = 'abc1234def5678';
const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const DAY_MS = 86_400_000;

function event(over: Partial<ReleaseEvent> = {}): ReleaseEvent {
  return {
    id: 1,
    event: 'promoted',
    surface: 'web',
    environment: 'production',
    outcome: 'succeeded',
    commitSha: COMMIT,
    deploymentId: 'dpl_1',
    previousDeploymentId: null,
    actor: 'ci',
    source: 'deploy_workflow',
    reason: null,
    runUrl: null,
    detail: {},
    recordedAt: '2026-09-18T10:00:00.000Z',
    previousHash: GENESIS_HASH,
    entryHash: 'a'.repeat(64),
    ...over,
  };
}

function ledgerRow(over: Record<string, unknown> = {}) {
  return {
    surface: 'web',
    target: 'production',
    commit_sha: COMMIT,
    deployment_ref: 'https://example.test',
    head_sequence: 263,
    head_filename: '0263_release_audit_trail.sql',
    applied_count: 4,
    verified_at: new Date('2026-09-18T09:00:00.000Z'),
    ...over,
  };
}

function withLedger(rows: Record<string, unknown>[], relation = 'schema_migration_deployments') {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('to_regclass')) return [{ relation }];
    return rows;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.readReleaseEvents.mockResolvedValue([]);
  mocks.readLatestReleaseEvent.mockResolvedValue(null);
  vi.stubEnv('AGI_RELEASE_SHA', COMMIT);
  vi.stubEnv('AGI_DEPLOY_ENV', 'production');
});

describe('the migration ledger', () => {
  it('answers with nothing when the runner has never created its table', async () => {
    withLedger([], null as unknown as string);

    expect(await readReleaseLedger()).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('reads production records only', async () => {
    withLedger([ledgerRow()]);

    const entries = await readReleaseLedger();

    const [sql] = mocks.query.mock.calls[1] as [string];
    expect(sql).toContain("target = 'production'");
    expect(entries[0]).toMatchObject({ headSequence: 263, appliedCount: 4, surface: 'web' });
    expect(entries[0]?.verifiedAt).toBe('2026-09-18T09:00:00.000Z');
  });
});

describe('the dashboard', () => {
  it('agrees with the ledger when the running commit is the one recorded', async () => {
    withLedger([ledgerRow()]);

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.serving.commit).toBe(COMMIT);
    expect(dashboard.ledgerMatchesServing).toBe(true);
  });

  it('reports a mismatch when production is not the commit last recorded', async () => {
    withLedger([ledgerRow({ commit_sha: 'f'.repeat(40) })]);

    expect((await readReleaseDashboard(NOW)).ledgerMatchesServing).toBe(false);
  });

  it('answers null rather than false when there is nothing to compare', async () => {
    withLedger([]);

    expect((await readReleaseDashboard(NOW)).ledgerMatchesServing).toBeNull();
  });

  it('accepts a short serving sha against the full one in the ledger', async () => {
    vi.stubEnv('AGI_RELEASE_SHA', COMMIT.slice(0, 7));
    withLedger([ledgerRow()]);

    expect((await readReleaseDashboard(NOW)).ledgerMatchesServing).toBe(true);
  });

  it('reports no drill at all rather than a stale age', async () => {
    withLedger([]);
    mocks.readReleaseEvents.mockResolvedValue([event()]);

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.lastDrill).toBeNull();
    expect(dashboard.drillAgeDays).toBeNull();
  });

  it('ages the last successful drill and ignores a failed one', async () => {
    withLedger([]);
    mocks.readLatestReleaseEvent.mockImplementation(
      async (query: { event: string; outcome?: string }) =>
        query.event === 'rollback_drill' && query.outcome === 'succeeded'
          ? event({
              id: 2,
              event: 'rollback_drill',
              outcome: 'succeeded',
              recordedAt: new Date(NOW - 7 * DAY_MS).toISOString(),
            })
          : null,
    );

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.lastDrill?.id).toBe(2);
    expect(dashboard.drillAgeDays).toBe(7);
    expect(mocks.readLatestReleaseEvent).toHaveBeenCalledWith({
      event: 'rollback_drill',
      outcome: 'succeeded',
    });
  });

  it('keeps a successful drill and a rollback that are older than the displayed event window', async () => {
    withLedger([]);
    const newerEvents = Array.from({ length: 50 }, (_, index) =>
      event({ id: 100 - index, event: 'promoted' }),
    );
    mocks.readReleaseEvents.mockResolvedValue(newerEvents);
    mocks.readLatestReleaseEvent.mockImplementation(async (query: { event: string }) =>
      query.event === 'rollback_drill'
        ? event({
            id: 3,
            event: 'rollback_drill',
            recordedAt: new Date(NOW - 2 * DAY_MS).toISOString(),
          })
        : event({ id: 2, event: 'rolled_back', deploymentId: 'dpl_old_good' }),
    );

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.events.some((entry) => entry.event !== 'promoted')).toBe(false);
    expect(dashboard.lastDrill?.id).toBe(3);
    expect(dashboard.drillAgeDays).toBe(2);
    expect(dashboard.lastRollback?.deploymentId).toBe('dpl_old_good');
    expect(dashboard.unreadable).toEqual([]);
  });

  it('names the trail as unreadable when only the latest-event reads fail', async () => {
    withLedger([]);
    mocks.readLatestReleaseEvent.mockRejectedValue(new Error('timeout'));

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.unreadable).toEqual(['events']);
    expect(dashboard.lastDrill).toBeNull();
    expect(dashboard.lastRollback).toBeNull();
  });

  it('names the source it could not read rather than reporting it empty', async () => {
    mocks.query.mockRejectedValue(new Error('relation does not exist'));
    mocks.readReleaseEvents.mockRejectedValue(new Error('relation does not exist'));
    mocks.readLatestReleaseEvent.mockRejectedValue(new Error('relation does not exist'));

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.unreadable.sort()).toEqual(['events', 'ledger']);
    expect(dashboard.ledger).toEqual([]);
    expect(dashboard.events).toEqual([]);
  });

  it('surfaces the newest rollback and the chain verdict', async () => {
    withLedger([]);
    const rollback = event({
      id: 2,
      event: 'rolled_back',
      deploymentId: 'dpl_good',
      previousHash: 'z'.repeat(64),
    });
    mocks.readReleaseEvents.mockResolvedValue([rollback, event({ id: 1 })]);
    mocks.readLatestReleaseEvent.mockImplementation(async (query: { event: string }) =>
      query.event === 'rolled_back' ? rollback : null,
    );

    const dashboard = await readReleaseDashboard(NOW);

    expect(dashboard.lastRollback?.deploymentId).toBe('dpl_good');
    expect(dashboard.chain).toEqual({ intact: false, brokenAt: 2 });
  });
});
