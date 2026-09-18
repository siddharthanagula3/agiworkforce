import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));

import {
  GENESIS_HASH,
  RELEASE_AUDIT_RETENTION_DAYS,
  readReleaseEvents,
  recordReleaseEvent,
  verifyReleaseChain,
  type ReleaseEvent,
} from '../release-audit-store';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    event: 'rolled_back',
    surface: 'web',
    environment: 'production',
    outcome: 'succeeded',
    commit_sha: 'abc1234',
    deployment_id: 'dpl_good',
    previous_deployment_id: 'dpl_bad',
    actor: 'operator',
    source: 'rollback_workflow',
    reason: 'verification failed',
    run_url: 'https://example.test/run/1',
    detail: { requested: null },
    recorded_at: new Date('2026-09-18T10:00:00.000Z'),
    previous_hash: GENESIS_HASH,
    entry_hash: 'a'.repeat(64),
    ...over,
  };
}

function event(over: Partial<ReleaseEvent> = {}): ReleaseEvent {
  return {
    id: 1,
    event: 'promoted',
    surface: 'web',
    environment: 'production',
    outcome: 'succeeded',
    commitSha: 'abc1234',
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('appending a release event', () => {
  it('writes through the chaining function rather than inserting a row', async () => {
    mocks.query.mockResolvedValue([row()]);

    await recordReleaseEvent({
      event: 'rolled_back',
      surface: 'web',
      environment: 'production',
      outcome: 'succeeded',
      actor: 'operator',
      source: 'rollback_workflow',
      reason: 'verification failed',
    });

    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('public.append_release_event');
    expect(sql).not.toContain('insert into');
    expect(values[0]).toBe('rolled_back');
    expect(values[11]).toBe('{}');
  });

  it('refuses to report success when nothing came back', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(
      recordReleaseEvent({
        event: 'promoted',
        surface: 'web',
        environment: 'production',
        outcome: 'succeeded',
        actor: 'ci',
        source: 'deploy_workflow',
      }),
    ).rejects.toThrow('not appended');
  });

  it('carries the row back as camel case with an iso timestamp', async () => {
    mocks.query.mockResolvedValue([row()]);

    const appended = await recordReleaseEvent({
      event: 'rolled_back',
      surface: 'web',
      environment: 'production',
      outcome: 'succeeded',
      actor: 'operator',
      source: 'rollback_workflow',
      reason: 'verification failed',
    });

    expect(appended.previousDeploymentId).toBe('dpl_bad');
    expect(appended.recordedAt).toBe('2026-09-18T10:00:00.000Z');
    expect(appended.detail).toEqual({ requested: null });
  });

  it('reads a detail column the driver handed back as text', async () => {
    mocks.query.mockResolvedValue([row({ detail: '{"resolvedWithoutActing":true}' })]);

    const events = await readReleaseEvents();

    expect(events[0]?.detail).toEqual({ resolvedWithoutActing: true });
  });
});

describe('reading the trail', () => {
  it('caps a caller asking for more than the page limit', async () => {
    mocks.query.mockResolvedValue([]);

    await readReleaseEvents({ limit: 5000 });

    const [, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(values[2]).toBe(200);
  });

  it('passes a filter through as null when it is absent', async () => {
    mocks.query.mockResolvedValue([]);

    await readReleaseEvents({ surface: 'web' });

    const [, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(values[0]).toBe('web');
    expect(values[1]).toBeNull();
  });
});

describe('the hash chain', () => {
  it('accepts a trail whose every link points at its predecessor', () => {
    const verdict = verifyReleaseChain([
      event({ id: 2, previousHash: 'a'.repeat(64), entryHash: 'b'.repeat(64) }),
      event({ id: 1, previousHash: GENESIS_HASH, entryHash: 'a'.repeat(64) }),
    ]);

    expect(verdict).toEqual({ intact: true, brokenAt: null });
  });

  it('names the first event whose link does not match', () => {
    const verdict = verifyReleaseChain([
      event({ id: 1, previousHash: GENESIS_HASH, entryHash: 'a'.repeat(64) }),
      event({ id: 2, previousHash: 'c'.repeat(64), entryHash: 'b'.repeat(64) }),
    ]);

    expect(verdict).toEqual({ intact: false, brokenAt: 2 });
  });

  it('refuses a first event that does not start from the genesis hash', () => {
    const verdict = verifyReleaseChain([event({ id: 1, previousHash: 'd'.repeat(64) })]);

    expect(verdict).toEqual({ intact: false, brokenAt: 1 });
  });

  it('does not demand the genesis hash of a window that starts mid trail', () => {
    const verdict = verifyReleaseChain([event({ id: 9, previousHash: 'd'.repeat(64) })]);

    expect(verdict.intact).toBe(true);
  });
});

it('states a retention window the migration also enforces', () => {
  expect(RELEASE_AUDIT_RETENTION_DAYS).toBe(400);
});
