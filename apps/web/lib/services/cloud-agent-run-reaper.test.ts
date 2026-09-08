import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { listCanonicalModels } from '@agiworkforce/types';
const appendEvents = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./cloud-agent-run-service', () => ({ appendCloudAgentEvents: appendEvents }));
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
