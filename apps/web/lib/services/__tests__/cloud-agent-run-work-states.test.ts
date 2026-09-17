import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));
vi.mock('../agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CloudAgentRunListPageSchema,
  CloudAgentRunSnapshotPageSchema,
  AGENT_EVENT_SCHEMA_VERSION,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { notifyAgentRunEvent } from '../agent-notification-service';
import {
  CloudAgentApprovalCheckpointNotFoundError,
  CloudAgentRunNotPausableError,
  cancelPausedCloudAgentRun,
  claimCloudAgentPauseCheckpoint,
  getCloudAgentRun,
  listCloudAgentRuns,
  requestCloudAgentRunPause,
  saveCloudAgentPauseCheckpoint,
  transitionCloudAgentRun,
  withdrawCloudAgentRunPauseRequest,
} from '../cloud-agent-run-service';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const SESSION_ID = '0190a000-0000-7000-8000-000000000099';
const TURN_ID = 'agi.chat.web.send.turn-1';
const LEASE = '0190a000-0000-7000-8000-0000000000aa';

const RUN_ROW = {
  id: RUN_ID,
  user_id: 'user-1',
  request_id: TURN_ID,
  conversation_id: SESSION_ID,
  origin_surface: 'web',
  work_mode: 'agiwork',
  state: 'running',
  provider: 'anthropic',
  model: 'claude-test',
  last_event_sequence: 4,
  cancellation_requested_at: null,
  pause_requested_at: null,
  completed_at: null,
  created_at: '2026-09-16T20:00:00.000Z',
  updated_at: '2026-09-16T20:00:01.000Z',
};

const PAUSE_CHECKPOINT_ROW = {
  id: '0190a000-0000-7000-8000-000000000002',
  run_id: RUN_ID,
  user_id: 'user-1',
  version: 1,
  session_id: SESSION_ID,
  turn_id: TURN_ID,
  next_event_sequence: 7,
  completed_steps: 2,
  request: { model: 'claude-test', stream: true, work_mode: 'agiwork' },
  messages: [
    { role: 'user', content: 'research the market' },
    { role: 'assistant', content: 'Looking into it.' },
  ],
  pending_tool_calls: [],
  state: 'pending',
  checkpoint_kind: 'pause',
  lease_token: null,
  lease_expires_at: null,
  resolved_at: null,
  created_at: '2026-09-16T20:00:02.000Z',
  updated_at: '2026-09-16T20:00:02.000Z',
};

const base: Omit<AgentEventEnvelope, 'sequence' | 'event'> = {
  schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
  sessionId: SESSION_ID,
  turnId: TURN_ID,
  emittedAtMs: 1_757_800_000_000,
};

const PAUSE_EVENTS: AgentEventEnvelope[] = [
  {
    ...base,
    sequence: 5,
    event: {
      type: 'task-state-changed',
      taskId: TURN_ID,
      state: 'paused',
      previousState: 'running',
      summary: 'Agent work is paused. Resume it to continue from here.',
    },
  },
  { ...base, sequence: 6, event: { type: 'lifecycle', phase: 'paused' } },
];

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

describe('cloud agent run Work states', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    db = database();
  });

  describe('reading a run', () => {
    it('reads every stored pre-extension state back unchanged', async () => {
      for (const state of ['queued', 'running', 'awaiting_input', 'paused', 'archived']) {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ ...RUN_ROW, state }])
          .mockResolvedValueOnce([]);
        const snapshot = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID });
        expect(snapshot?.run).toMatchObject({ state, workState: state });
      }
    });

    it('reports a finer state in workState and its coarse neighbour in state', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'timed_out' }])
        .mockResolvedValueOnce([]);

      const snapshot = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID });

      expect(snapshot?.run).toMatchObject({ state: 'failed', workState: 'timed_out' });
    });

    it('tells an approval wait apart from an input wait', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            ...RUN_ROW,
            state: 'awaiting_input',
            pending_approval_requested_at: '2026-09-16T20:00:03.000Z',
            pending_approval_tool_calls: [
              { id: 'call-1', qualifiedName: 'mcp__github__create_issue', args: { title: 'x' } },
            ],
          },
        ])
        .mockResolvedValueOnce([]);

      const snapshot = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID });

      expect(snapshot?.run).toMatchObject({
        state: 'awaiting_input',
        workState: 'awaiting_approval',
      });
    });

    it('replays journaled finer states as their coarse neighbour so an older client still parses the page', async () => {
      const planning: AgentEventEnvelope = {
        ...base,
        sequence: 1,
        event: {
          type: 'task-state-changed',
          taskId: TURN_ID,
          state: 'planning',
          previousState: 'queued',
        },
      };
      const partial: AgentEventEnvelope = {
        ...base,
        sequence: 2,
        event: {
          type: 'task-state-changed',
          taskId: TURN_ID,
          state: 'partial',
          previousState: 'resuming',
        },
      };
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'partial' }])
        .mockResolvedValueOnce([
          { sequence: 1, envelope: planning, emitted_at: '2026-09-16T20:00:00.000Z' },
          { sequence: 2, envelope: partial, emitted_at: '2026-09-16T20:00:01.000Z' },
        ]);

      const snapshot = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID });

      expect(snapshot?.events.map((envelope) => envelope.event)).toEqual([
        expect.objectContaining({ state: 'running', previousState: 'queued' }),
        expect.objectContaining({ state: 'failed', previousState: 'running' }),
      ]);
      const legacyStates = [
        'queued',
        'running',
        'awaiting_input',
        'ready_for_review',
        'completed',
        'failed',
        'cancelled',
        'paused',
        'archived',
      ];
      expect(legacyStates).toContain(snapshot?.run.state);
      expect(() =>
        CloudAgentRunSnapshotPageSchema.parse({ ...snapshot, nextAfterSequence: 2 }),
      ).not.toThrow();
    });

    it('widens a coarse list filter to the finer states that read as it', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ ...RUN_ROW, state: 'planning' }]);

      const page = await listCloudAgentRuns(db, {
        userId: 'user-1',
        states: ['running', 'failed'],
      });

      const states = vi.mocked(db.query).mock.calls[0]![1]![1] as string[];
      expect([...states].sort()).toEqual(
        ['failed', 'partial', 'planning', 'resuming', 'running', 'timed_out'].sort(),
      );
      expect(page.runs[0]).toMatchObject({ state: 'running', workState: 'planning' });
      expect(() => CloudAgentRunListPageSchema.parse({ ...page, nextCursor: null })).not.toThrow();
    });
  });

  describe('settling a run', () => {
    it('keeps a finer terminal state the journal recorded when a settle reports the coarse outcome', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { ...RUN_ROW, state: 'timed_out', previous_state: 'timed_out' },
      ]);

      const run = await transitionCloudAgentRun(db, {
        userId: 'user-1',
        runId: RUN_ID,
        state: 'failed',
      });

      const [sql, params] = vi.mocked(db.query).mock.calls[0]!;
      expect(sql).toMatch(
        /case when runs\.state = any\(\$5::text\[\]\) then runs\.state else \$3 end/,
      );
      expect([...(params![4] as string[])].sort()).toEqual(['partial', 'timed_out']);
      expect(params![3]).toEqual(expect.arrayContaining(['partial', 'timed_out', 'failed']));
      expect(run).toMatchObject({ state: 'failed', workState: 'timed_out' });
      expect(notifyAgentRunEvent).not.toHaveBeenCalled();
    });

    it('announces a timed out run the first time it lands', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { ...RUN_ROW, state: 'timed_out', previous_state: 'running' },
      ]);

      await transitionCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID, state: 'timed_out' });

      expect(notifyAgentRunEvent).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ runId: RUN_ID, event: 'failed' }),
      );
    });
  });

  describe('pausing a run', () => {
    it('records the request only on a run that is still working', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { ...RUN_ROW, pause_requested_at: '2026-09-16T20:00:05.000Z' },
      ]);

      const run = await requestCloudAgentRunPause(db, { userId: 'user-1', runId: RUN_ID });

      expect(run.pauseRequestedAt).toBe('2026-09-16T20:00:05.000Z');
      expect(vi.mocked(db.query).mock.calls[0]![1]).toEqual([
        RUN_ID,
        'user-1',
        ['queued', 'planning', 'running', 'resuming'],
      ]);
    });

    it('refuses to pause a run that is waiting on the user or has stopped', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'ready_for_review' }]);

      await expect(
        requestCloudAgentRunPause(db, { userId: 'user-1', runId: RUN_ID }),
      ).rejects.toBeInstanceOf(CloudAgentRunNotPausableError);
    });

    it('stores a pause with no outstanding tool call and moves the run to paused', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: RUN_ID }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ next_version: 1 }])
        .mockResolvedValueOnce([PAUSE_CHECKPOINT_ROW])
        .mockResolvedValueOnce(PAUSE_EVENTS.map(({ sequence }) => ({ sequence })))
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'paused', last_event_sequence: 6 }])
        .mockResolvedValueOnce([]);

      const checkpoint = await saveCloudAgentPauseCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        nextEventSequence: 7,
        completedSteps: 2,
        request: PAUSE_CHECKPOINT_ROW.request,
        messages: PAUSE_CHECKPOINT_ROW.messages,
        events: PAUSE_EVENTS,
      });

      expect(checkpoint.pendingToolCalls).toEqual([]);
      expect(vi.mocked(db.query).mock.calls[3]![0]).toMatch(/'\[\]'::jsonb, 'pending', 'pause'/);
      expect(vi.mocked(db.query).mock.calls[6]![0]).toMatch(
        /set state = 'paused', pause_requested_at = null/,
      );
    });

    it('refuses a pause whose events do not end on the pause boundary', async () => {
      await expect(
        saveCloudAgentPauseCheckpoint(db, {
          userId: 'user-1',
          runId: RUN_ID,
          sessionId: SESSION_ID,
          turnId: TURN_ID,
          nextEventSequence: 7,
          completedSteps: 2,
          request: PAUSE_CHECKPOINT_ROW.request,
          messages: PAUSE_CHECKPOINT_ROW.messages,
          events: [
            {
              ...PAUSE_EVENTS[0]!,
              event: { type: 'task-state-changed', taskId: TURN_ID, state: 'awaiting_input' },
            },
            PAUSE_EVENTS[1]!,
          ],
        }),
      ).rejects.toThrow(/complete pause boundary/i);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('resuming a run', () => {
    it('withdraws a pause the executor has not reached yet', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([RUN_ROW]);

      const run = await withdrawCloudAgentRunPauseRequest(db, { userId: 'user-1', runId: RUN_ID });

      expect(run).toMatchObject({ state: 'running', pauseRequestedAt: null });
      expect(vi.mocked(db.query).mock.calls[0]![0]).toMatch(/set pause_requested_at = null/);
    });

    it('claims the pause once and marks the run resuming', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([PAUSE_CHECKPOINT_ROW])
        .mockResolvedValueOnce([
          {
            ...PAUSE_CHECKPOINT_ROW,
            state: 'resuming',
            lease_token: LEASE,
            lease_expires_at: '2026-09-17T20:00:02.000Z',
          },
        ])
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'resuming' }]);

      const claim = await claimCloudAgentPauseCheckpoint(db, { userId: 'user-1', runId: RUN_ID });

      expect(claim.leaseToken).toBe(LEASE);
      expect(claim.checkpoint.completedSteps).toBe(2);
      expect(vi.mocked(db.query).mock.calls[0]![0]).toMatch(/checkpoint_kind = 'pause'/);
      expect(vi.mocked(db.query).mock.calls[2]![0]).toMatch(
        /set state = 'resuming'[\s\S]*state = 'paused'[\s\S]*cancellation_requested_at is null/,
      );
    });

    it('reports a run with no pause to resume', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      await expect(
        claimCloudAgentPauseCheckpoint(db, { userId: 'user-1', runId: RUN_ID }),
      ).rejects.toBeInstanceOf(CloudAgentApprovalCheckpointNotFoundError);
    });
  });

  describe('cancelling a paused run', () => {
    it('ends the run itself, journaling the cancellation at the cursor the pause recorded', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ ...PAUSE_CHECKPOINT_ROW, state: 'failed' }])
        .mockResolvedValueOnce([{ sequence: 7 }])
        .mockResolvedValueOnce([
          { ...RUN_ROW, state: 'cancelled', last_event_sequence: 7, previous_state: 'paused' },
        ]);

      const run = await cancelPausedCloudAgentRun(db, { userId: 'user-1', runId: RUN_ID });

      expect(run).toMatchObject({ state: 'cancelled', workState: 'cancelled' });
      const insertParams = vi.mocked(db.query).mock.calls[1]![1] as unknown[];
      expect(insertParams).toEqual(
        expect.arrayContaining([
          7,
          'task-state-changed',
          expect.objectContaining({
            sequence: 7,
            event: expect.objectContaining({ state: 'cancelled', previousState: 'paused' }),
          }),
        ]),
      );
    });
  });
});
