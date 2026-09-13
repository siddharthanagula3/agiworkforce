import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { listCanonicalModels } from '@agiworkforce/types';
import { WORKFLOW_WORLD_CALL_DEADLINE_MS } from '@/lib/deadline-policy';
const appendEvents = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./cloud-agent-run-service', () => ({ appendCloudAgentEvents: appendEvents }));
const cancelWorldRun = vi.hoisted(() => vi.fn(async (_workflowRunId: string) => undefined));
const inFlight = vi.hoisted(() => ({ now: 0, peak: 0 }));
vi.mock('workflow/api', () => ({
  getRun: (runId: string) => ({
    cancel: async () => {
      inFlight.now += 1;
      inFlight.peak = Math.max(inFlight.peak, inFlight.now);
      try {
        await cancelWorldRun(runId);
      } finally {
        inFlight.now -= 1;
      }
    },
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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

const ZERO_COST_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.inputCost === 0 && candidate.outputCost === 0 && candidate.apiModelId,
  );
  if (!model) throw new Error('The catalog must expose a zero-cost model with an api id');
  return model;
})();

const REAPED = {
  id: '0190a000-0000-7000-8000-000000000001',
  user_id: 'user-1',
  state: 'failed',
  conversation_id: '0190a000-0000-7000-8000-000000000009',
  request_id: 'agi.chat.web.send.turn-1',
  model: ZERO_COST_MODEL.id,
  last_event_sequence: 4,
  workflow_run_id: 'wfr_reaped_1',
};
const REAPED_AFTER_STOP = {
  ...REAPED,
  id: '0190a000-0000-7000-8000-000000000002',
  state: 'cancelled',
};

let db: DatabaseAdapter;

beforeEach(() => {
  vi.clearAllMocks();
  appendEvents.mockResolvedValue(undefined);
  cancelWorldRun.mockResolvedValue(undefined);
  inFlight.now = 0;
  inFlight.peak = 0;
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

  it('tells the reader why the run ended, rather than only changing its state', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED]);

    await reapOrphanedCloudAgentRuns(db);

    expect(appendEvents).toHaveBeenCalledTimes(1);
    const call = (appendEvents.mock.calls as unknown as unknown[][])[0]?.[1] as {
      userId: string;
      runId: string;
      envelopes: Array<{ sequence: number; event: { type: string; message?: string } }>;
    };
    expect(call.userId).toBe('user-1');
    expect(call.runId).toBe(REAPED.id);
    expect(call.envelopes[0]?.event.type).toBe('error');
    expect(call.envelopes[0]?.event.message).toMatch(/did not finish/i);
    expect(call.envelopes.at(-1)?.event.type).toBe('task-state-changed');
    expect(call.envelopes[0]?.sequence).toBe(REAPED.last_event_sequence + 1);
  });

  it('still ends the run when its reason cannot be journalled', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED]);
    appendEvents.mockRejectedValueOnce(new Error('journal is unreachable'));

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report.reaped).toBe(1);
  });

  it('reports nothing swept when every run is either fresh or finished', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]);

    expect(await reapOrphanedCloudAgentRuns(db)).toEqual({
      reaped: 0,
      stoppedByUser: 0,
      worldRunsCancelled: 0,
      worldRunsUncancelled: 0,
      remaining: false,
    });
  });

  it('keeps sweeping while a batch comes back full', async () => {
    const full = Array.from({ length: 200 }, (_unused, index) => ({
      ...REAPED,
      id: `0190a000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    }));
    vi.mocked(db.query).mockResolvedValueOnce(full).mockResolvedValueOnce([REAPED]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report.reaped).toBe(201);
    expect(vi.mocked(db.query)).toHaveBeenCalledTimes(2);
  });

  it('stops on its own budget and says work is left rather than running past it', async () => {
    const full = Array.from({ length: 200 }, (_unused, index) => ({
      ...REAPED,
      id: `0190a000-0000-7000-8000-${String(index).padStart(12, '0')}`,
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

/**
 * The half of the reap that was missing: `cloud_agent_runs.workflow_run_id` was
 * stored but never used, so a reaped row left its world invocation running. The
 * world redelivered the flow every 15 minutes and each redelivery burned the
 * whole 800 s invocation limit.
 */
describe('cancelling the world run behind a reaped row', () => {
  it('cancels the invocation every reaped row names', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED, REAPED_AFTER_STOP]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(cancelWorldRun).toHaveBeenCalledTimes(2);
    expect(cancelWorldRun).toHaveBeenCalledWith(REAPED.workflow_run_id);
    expect(report.worldRunsCancelled).toBe(2);
    expect(report.worldRunsUncancelled).toBe(0);
  });

  it('reads the workflow run id back from the update, so a row cannot be reaped blind', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([REAPED]);

    await reapOrphanedCloudAgentRuns(db);

    const [sql] = vi.mocked(db.query).mock.calls[0] as [string];
    expect(sql).toMatch(/returning[\s\S]*workflow_run_id/);
  });

  it('moves on from a world cancel that never answers, and counts it as uncancelled', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(db.query).mockResolvedValueOnce([REAPED]);
      cancelWorldRun.mockImplementationOnce(() => new Promise(() => undefined));

      const pending = reapOrphanedCloudAgentRuns(db);
      await vi.advanceTimersByTimeAsync(WORKFLOW_WORLD_CALL_DEADLINE_MS);
      const report = await pending;

      expect(report.reaped).toBe(1);
      expect(report.worldRunsCancelled).toBe(0);
      expect(report.worldRunsUncancelled).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips a row that never reached the workflow platform', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([{ ...REAPED, workflow_run_id: null }]);

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(cancelWorldRun).not.toHaveBeenCalled();
    expect(report.reaped).toBe(1);
  });

  it('reaps the rest when one run refuses to cancel, and says so', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...REAPED, workflow_run_id: 'wfr_gone' },
      REAPED_AFTER_STOP,
    ]);
    cancelWorldRun.mockRejectedValueOnce(new Error('run not found'));

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report.reaped).toBe(2);
    expect(report.worldRunsUncancelled).toBe(1);
    expect(report.worldRunsCancelled).toBe(1);
    expect(appendEvents).toHaveBeenCalledTimes(2);
  });

  it('bounds how many cancels are in flight at once', async () => {
    const batch = Array.from({ length: 200 }, (_unused, index) => ({
      ...REAPED,
      id: `0190a000-0000-7000-8000-${String(index).padStart(12, '0')}`,
      workflow_run_id: `wfr_${index}`,
    }));
    vi.mocked(db.query).mockResolvedValueOnce(batch).mockResolvedValueOnce([]);
    cancelWorldRun.mockImplementation(
      () => new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1)),
    );

    const report = await reapOrphanedCloudAgentRuns(db);

    expect(report.worldRunsCancelled).toBe(200);
    expect(inFlight.peak).toBeGreaterThan(1);
    expect(inFlight.peak).toBeLessThanOrEqual(8);
  });
});
