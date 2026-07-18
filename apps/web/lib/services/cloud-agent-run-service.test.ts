import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  appendCloudAgentEvent,
  createCloudAgentRun,
  getCloudAgentRun,
  requestCloudAgentRunCancellation,
  transitionCloudAgentRun,
} from './cloud-agent-run-service';

const RUN_ROW = {
  id: '0190a000-0000-7000-8000-000000000001',
  user_id: 'user-1',
  request_id: 'agi.chat.web.send.turn-1',
  conversation_id: '0190a000-0000-7000-8000-000000000099',
  origin_surface: 'web',
  work_mode: 'agiwork',
  state: 'running',
  provider: 'anthropic',
  model: 'claude-test',
  last_event_sequence: 2,
  cancellation_requested_at: null,
  completed_at: null,
  created_at: '2026-07-17T20:00:00.000Z',
  updated_at: '2026-07-17T20:00:01.000Z',
};

function database(): DatabaseAdapter {
  const db = {
    query: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  db.transaction.mockImplementation(async (fn: (tx: DatabaseAdapter) => Promise<unknown>) =>
    fn(db as unknown as DatabaseAdapter),
  );
  return db as unknown as DatabaseAdapter;
}

const envelope: AgentEventEnvelope = {
  schemaVersion: 3,
  sessionId: '0190a000-0000-7000-8000-000000000099',
  turnId: 'agi.chat.web.send.turn-1',
  sequence: 2,
  emittedAtMs: 1_752_780_000_000,
  event: {
    type: 'task-state-changed',
    taskId: 'agi.chat.web.send.turn-1',
    state: 'ready_for_review',
    previousState: 'running',
    summary: 'Ready',
  },
};

describe('cloud agent run service', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    db = database();
  });

  it('creates one tenant-owned run keyed by the managed request id', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([RUN_ROW]);

    const run = await createCloudAgentRun(db, {
      userId: 'user-1',
      requestId: 'agi.chat.web.send.turn-1',
      conversationId: '0190a000-0000-7000-8000-000000000099',
      originSurface: 'web',
      workMode: 'agiwork',
      provider: 'anthropic',
      model: 'claude-test',
    });

    expect(run.id).toBe(RUN_ROW.id);
    expect(run.originSurface).toBe('web');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/insert into public\.cloud_agent_runs/i),
      [
        'user-1',
        'agi.chat.web.send.turn-1',
        '0190a000-0000-7000-8000-000000000099',
        'web',
        'agiwork',
        'anthropic',
        'claude-test',
      ],
    );
  });

  it('appends an envelope and advances state atomically only for a new sequence', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ sequence: 2 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'ready_for_review' }]);

    const run = await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      envelope,
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/insert into public\.cloud_agent_events/i),
      [RUN_ROW.id, 'user-1', 2, envelope.emittedAtMs, 'task-state-changed', envelope],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/update public\.cloud_agent_runs/i),
      [RUN_ROW.id, 'user-1', 2, 'ready_for_review'],
    );
    expect(run.state).toBe('ready_for_review');
  });

  it('does not regress state when the same event is replayed', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running', last_event_sequence: 3 }]);

    const run = await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      envelope,
    });

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/select[\s\S]*from public\.cloud_agent_runs/i),
      [RUN_ROW.id, 'user-1'],
    );
    expect(run.lastEventSequence).toBe(3);
  });

  it('stores a late event without allowing it to regress a newer run state', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ sequence: 2 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'ready_for_review', last_event_sequence: 3 }]);

    const run = await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      envelope,
    });

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/when \$3 >= last_event_sequence/i),
      [RUN_ROW.id, 'user-1', 2, 'ready_for_review'],
    );
    expect(run.state).toBe('ready_for_review');
    expect(run.lastEventSequence).toBe(3);
  });

  it('returns only the owner run and events after the requested cursor', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([RUN_ROW])
      .mockResolvedValueOnce([
        {
          sequence: 2,
          envelope,
          emitted_at: '2026-07-17T20:00:01.000Z',
        },
      ]);

    const result = await getCloudAgentRun(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      afterSequence: 1,
      limit: 50,
    });

    expect(result?.events).toEqual([envelope]);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/sequence > \$3/i), [
      RUN_ROW.id,
      'user-1',
      1,
      50,
    ]);
  });

  it('persists cancellation intent without claiming termination before executor acknowledgement', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          ...RUN_ROW,
          cancellation_requested_at: '2026-07-17T20:00:02.000Z',
        },
      ])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'failed' }]);

    const cancelled = await requestCloudAgentRunCancellation(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
    });
    const failed = await transitionCloudAgentRun(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      state: 'failed',
    });

    expect(cancelled.state).toBe('running');
    expect(cancelled.cancellationRequestedAt).toBe('2026-07-17T20:00:02.000Z');
    expect(failed.state).toBe('failed');
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/cancellation_requested_at = coalesce/i),
      [RUN_ROW.id, 'user-1'],
    );
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/state = \$3/i), [
      RUN_ROW.id,
      'user-1',
      'failed',
    ]);
  });
});
