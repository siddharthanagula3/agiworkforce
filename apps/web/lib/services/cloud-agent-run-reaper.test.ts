import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS,
  reapOrphanedCloudAgentRuns,
} from './cloud-agent-run-reaper';

function database(): DatabaseAdapter {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

const REAPED = { id: 'run-1', state: 'failed' };
const REAPED_AFTER_STOP = { id: 'run-2', state: 'cancelled' };

let db: DatabaseAdapter;

beforeEach(() => {
  db = database();
});

/**
 * Nine runs sat in `running` for days after the invocations behind them were
 * killed, one of them the founder's 2026-09-07 turn. Nothing swept them; the
 * lead cancelled them by hand through the Workflow API.
 */
describe('reaping a run whose invocation is gone', () => {
  it('waits out both the invocation ceiling and the operation lease before deciding', () => {
    expect(CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS).toBeGreaterThanOrEqual(800 + 300);
  });

  it('ends only runs that are past the age and still non-terminal', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report).toMatchObject({ reaped: 1, stoppedByUser: 0, remaining: false });
    const [sql, params] = vi.mocked(db.query).mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/state in \('queued', 'running'\)/);
    expect(sql).toMatch(/updated_at < now\(\) - make_interval/);
    expect(params[0]).toBe(CLOUD_AGENT_ORPHANED_RUN_AGE_SECONDS);
  });

  it('leaves a run parked on a person alone', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]);

    await reapOrphanedCloudAgentRuns(db);

    const [sql] = vi.mocked(db.query).mock.calls[0] as [string];
    for (const parked of ['awaiting_input', 'ready_for_review', 'paused']) {
      expect(sql).not.toContain(parked);
    }
  });

  it('records a run the reader had asked to stop as cancelled, not as a failure', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED, REAPED_AFTER_STOP]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report).toMatchObject({ reaped: 2, stoppedByUser: 1 });
    const [sql] = vi.mocked(db.query).mock.calls[0] as [string];
    expect(sql).toMatch(/cancellation_requested_at is null/);
  });

  it('reports nothing swept when every run is either fresh or finished', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]);

    expect(await reapOrphanedCloudAgentRuns(db)).toEqual({
      reaped: 0,
      stoppedByUser: 0,
      remaining: false,
    });
  });

  it('keeps sweeping while a batch comes back full', async () => {
    const full = Array.from({ length: 200 }, (_unused, index) => ({
      id: `run-${index}`,
      state: 'failed',
    }));
    vi.mocked(db.query).mockResolvedValueOnce(full).mockResolvedValueOnce([REAPED]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report.reaped).toBe(201);
    expect(vi.mocked(db.query)).toHaveBeenCalledTimes(2);
  });

  it('stops on its own budget and says work is left rather than running past it', async () => {
    const full = Array.from({ length: 200 }, (_unused, index) => ({
      id: `run-${index}`,
      state: 'failed',
    }));
    vi.mocked(db.query).mockResolvedValue(full);
    let nowMs = 0;

    const report = await reapOrphanedCloudAgentRuns(db, {
      now: () => {
        nowMs += 200_000;
        return nowMs;
      },
    });

    expect(report.remaining).toBe(true);
  });
});
