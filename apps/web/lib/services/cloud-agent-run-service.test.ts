import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  APPROVAL_CHECKPOINT_TTL_HOURS,
  appendCloudAgentEvent,
  claimCloudAgentApprovalCheckpoint,
  completeCloudAgentApprovalCheckpoint,
  createCloudAgentRun,
  findActiveCloudAgentRunForConversation,
  getCloudAgentRun,
  listCloudAgentRuns,
  requestCloudAgentRunCancellation,
  releaseCloudAgentApprovalCheckpoint,
  saveCloudAgentApprovalCheckpoint,
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

const APPROVAL_EVENTS: AgentEventEnvelope[] = [
  {
    ...envelope,
    sequence: 3,
    event: {
      type: 'approval-requested',
      approvalId: 'call-1',
      toolCallId: 'call-1',
      name: 'mcp__github__read_file',
      category: 'connector',
      summary: 'Allow this connector action?',
      input: {},
    },
  },
  {
    ...envelope,
    sequence: 4,
    event: {
      type: 'task-state-changed',
      taskId: RUN_ROW.request_id,
      state: 'awaiting_input',
      previousState: 'running',
      summary: 'The agent needs approval before it can continue.',
    },
  },
  {
    ...envelope,
    sequence: 5,
    event: {
      type: 'lifecycle',
      phase: 'paused',
    },
  },
];

const CHECKPOINT_ROW = {
  id: '0190a000-0000-7000-8000-000000000002',
  run_id: RUN_ROW.id,
  user_id: 'user-1',
  version: 1,
  session_id: RUN_ROW.conversation_id,
  turn_id: RUN_ROW.request_id,
  next_event_sequence: 6,
  completed_steps: 1,
  request: { model: 'claude-test', stream: true },
  messages: [
    { role: 'user', content: 'inspect the repository' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'mcp__github__read_file', arguments: '{}' },
        },
      ],
    },
  ],
  pending_tool_calls: [
    {
      id: 'call-1',
      qualifiedName: 'mcp__github__read_file',
      args: {},
    },
  ],
  state: 'pending',
  lease_token: null,
  lease_expires_at: null,
  resolved_at: null,
  created_at: '2026-07-17T20:00:01.000Z',
  updated_at: '2026-07-17T20:00:01.000Z',
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

  it('normalizes PostgreSQL Date timestamps returned by Neon', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        ...RUN_ROW,
        created_at: new Date(RUN_ROW.created_at),
        updated_at: new Date(RUN_ROW.updated_at),
      },
    ]);

    const run = await createCloudAgentRun(db, {
      userId: 'user-1',
      requestId: 'agi.chat.web.send.turn-1',
      conversationId: '0190a000-0000-7000-8000-000000000099',
      originSurface: 'web',
      workMode: 'agiwork',
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(run.createdAt).toBe(RUN_ROW.created_at);
    expect(run.updatedAt).toBe(RUN_ROW.updated_at);
  });

  it('finds an active guarding run for a conversation, excluding the caller retry and cancelling runs', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([RUN_ROW]);

    const active = await findActiveCloudAgentRunForConversation(db, {
      userId: 'user-1',
      conversationId: '0190a000-0000-7000-8000-000000000099',
      excludeRequestId: 'agi.chat.web.send.turn-2',
    });

    expect(active?.id).toBe(RUN_ROW.id);
    const [sql, params] = vi.mocked(db.query).mock.calls[0]!;
    expect(sql).toMatch(/state in \('running', 'queued'\)/i);
    expect(sql).toMatch(/cancellation_requested_at is null/i);
    expect(sql).toMatch(/request_id <> \$3/i);
    expect(params).toEqual([
      'user-1',
      '0190a000-0000-7000-8000-000000000099',
      'agi.chat.web.send.turn-2',
    ]);
  });

  it('returns null when no active run guards the conversation', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]);

    const active = await findActiveCloudAgentRunForConversation(db, {
      userId: 'user-1',
      conversationId: '0190a000-0000-7000-8000-000000000099',
    });

    expect(active).toBeNull();
    expect(vi.mocked(db.query).mock.calls[0]![1]).toEqual([
      'user-1',
      '0190a000-0000-7000-8000-000000000099',
      null,
    ]);
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

  it('lists only tenant-owned runs in the requested states with a stable tuple cursor', async () => {
    const olderRow = {
      ...RUN_ROW,
      id: '0190a000-0000-7000-8000-000000000002',
      state: 'awaiting_input',
      updated_at: '2026-07-17T19:59:59.000Z',
    };
    const overflowRow = {
      ...RUN_ROW,
      id: '0190a000-0000-7000-8000-000000000003',
      state: 'ready_for_review',
      updated_at: '2026-07-17T19:59:58.000Z',
    };
    vi.mocked(db.query).mockResolvedValueOnce([olderRow, overflowRow]);

    const result = await listCloudAgentRuns(db, {
      userId: 'user-1',
      states: ['awaiting_input', 'ready_for_review'],
      before: {
        updatedAt: '2026-07-17T20:00:00.000Z',
        id: '0190a000-0000-7000-8000-000000000099',
      },
      limit: 1,
    });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.id).toBe(olderRow.id);
    expect(result.next).toEqual({ updatedAt: olderRow.updated_at, id: olderRow.id });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /user_id = \$1[\s\S]*state = any\(\$2::text\[\]\)[\s\S]*request_id = \$3[\s\S]*\(updated_at, id\) < \(\$4::timestamptz, \$5::uuid\)/i,
      ),
      [
        'user-1',
        ['awaiting_input', 'ready_for_review'],
        null,
        '2026-07-17T20:00:00.000Z',
        '0190a000-0000-7000-8000-000000000099',
        2,
      ],
    );
  });

  it('looks up an exact request id within both tenant and state scope', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([{ ...RUN_ROW, state: 'completed' }]);

    const result = await listCloudAgentRuns(db, {
      userId: 'user-1',
      states: ['completed', 'cancelled'],
      requestId: RUN_ROW.request_id,
      limit: 1,
    });

    expect(result.runs).toHaveLength(1);
    const [sql, params] = vi.mocked(db.query).mock.calls[0]!;
    expect(sql).toMatch(
      /where user_id = \$1[\s\S]*state = any\(\$2::text\[\]\)[\s\S]*request_id = \$3/i,
    );
    expect(params).toEqual([
      'user-1',
      ['completed', 'cancelled'],
      RUN_ROW.request_id,
      null,
      null,
      2,
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

  it('versions and stores a server-owned approval checkpoint under the run lock', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: RUN_ROW.id }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ next_version: 1 }])
      .mockResolvedValueOnce([CHECKPOINT_ROW])
      .mockResolvedValueOnce([{ sequence: 3 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, last_event_sequence: 3 }])
      .mockResolvedValueOnce([{ sequence: 4 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 4 }])
      .mockResolvedValueOnce([{ sequence: 5 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 5 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input' }]);

    const checkpoint = await saveCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      sessionId: RUN_ROW.conversation_id!,
      turnId: RUN_ROW.request_id,
      nextEventSequence: 6,
      completedSteps: 1,
      request: CHECKPOINT_ROW.request,
      messages: CHECKPOINT_ROW.messages,
      pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
      events: APPROVAL_EVENTS,
    });

    expect(checkpoint.id).toBe(CHECKPOINT_ROW.id);
    expect(checkpoint.pendingToolCalls).toEqual(CHECKPOINT_ROW.pending_tool_calls);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/cloud_agent_runs[\s\S]*for update/i),
      [RUN_ROW.id, 'user-1'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /state = 'resolved'[\s\S]*lease_expires_at = null[\s\S]*state = 'resuming'/i,
      ),
      [RUN_ROW.id, 'user-1'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      11,
      expect.stringMatching(/state = 'awaiting_input'/i),
      [RUN_ROW.id, 'user-1'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      5,
      expect.stringMatching(/insert into public\.cloud_agent_events/i),
      [
        RUN_ROW.id,
        'user-1',
        APPROVAL_EVENTS[0]!.sequence,
        APPROVAL_EVENTS[0]!.emittedAtMs,
        APPROVAL_EVENTS[0]!.event.type,
        APPROVAL_EVENTS[0],
      ],
    );
  });

  it('rejects an incomplete approval boundary before opening a transaction', async () => {
    await expect(
      saveCloudAgentApprovalCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        sessionId: RUN_ROW.conversation_id!,
        turnId: RUN_ROW.request_id,
        nextEventSequence: 6,
        completedSteps: 1,
        request: CHECKPOINT_ROW.request,
        messages: CHECKPOINT_ROW.messages,
        pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
        events: [APPROVAL_EVENTS[0]!, APPROVAL_EVENTS[1]!, { ...APPROVAL_EVENTS[1]!, sequence: 5 }],
      }),
    ).rejects.toThrow(/complete approval boundary/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects unvalidated private thinking blocks before opening a transaction', async () => {
    await expect(
      saveCloudAgentApprovalCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        sessionId: RUN_ROW.conversation_id!,
        turnId: RUN_ROW.request_id,
        nextEventSequence: 6,
        completedSteps: 1,
        request: CHECKPOINT_ROW.request,
        messages: [
          {
            role: 'assistant',
            content: '',
            __canonicalThinking: [{ type: 'redacted_thinking', data: 'not-signed-thinking' }],
          },
        ],
        pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
        events: APPROVAL_EVENTS,
      }),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('claims the latest pending checkpoint only when every decision matches a pending call', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([CHECKPOINT_ROW])
      .mockResolvedValueOnce([
        {
          ...CHECKPOINT_ROW,
          state: 'resuming',
          lease_token: '0190a000-0000-7000-8000-000000000003',
          lease_expires_at: '2026-07-17T20:15:00.000Z',
        },
      ])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running' }]);

    const claimed = await claimCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      approvals: [{ toolCallId: 'call-1', decision: 'approved' }],
    });

    expect(claimed.checkpoint.state).toBe('resuming');
    expect(claimed.approvals).toEqual([{ toolCallId: 'call-1', decision: 'approved' }]);
    expect(claimed.leaseToken).toBe('0190a000-0000-7000-8000-000000000003');
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/state = 'pending'[\s\S]*created_at >[\s\S]*for update/i),
      [RUN_ROW.id, 'user-1', APPROVAL_CHECKPOINT_TTL_HOURS],
    );
  });

  it('supports a one-day approval continuation lease for durable workflows', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([CHECKPOINT_ROW])
      .mockResolvedValueOnce([
        {
          ...CHECKPOINT_ROW,
          state: 'resuming',
          lease_token: '0190a000-0000-7000-8000-000000000003',
          lease_expires_at: '2026-07-18T20:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running' }]);

    await claimCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      approvals: [{ toolCallId: 'call-1', decision: 'approved' }],
      leaseSeconds: 86_400,
    });

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/make_interval\(secs => \$4\)/i),
      [CHECKPOINT_ROW.id, 'user-1', expect.any(String), 86_400],
    );
  });

  it('rejects a forged approval before claiming the checkpoint', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([CHECKPOINT_ROW]);

    await expect(
      claimCloudAgentApprovalCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        approvals: [{ toolCallId: 'call-forged', decision: 'approved' }],
      }),
    ).rejects.toMatchObject({ name: 'CloudAgentApprovalDecisionError' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('resolves only the checkpoint lease that completed', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([{ ...CHECKPOINT_ROW, state: 'resolved' }]);

    const checkpoint = await completeCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      checkpointId: CHECKPOINT_ROW.id,
      leaseToken: '0190a000-0000-7000-8000-000000000003',
    });

    expect(checkpoint.state).toBe('resolved');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /lease_token = \$4[\s\S]*state in \('resuming', 'resolved', 'failed'\)/i,
      ),
      [CHECKPOINT_ROW.id, 'user-1', 'resolved', '0190a000-0000-7000-8000-000000000003'],
    );
  });

  it('keeps a predecessor resolved when the continuation already reached another checkpoint', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([{ ...CHECKPOINT_ROW, state: 'resolved' }]);

    const checkpoint = await completeCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      checkpointId: CHECKPOINT_ROW.id,
      leaseToken: '0190a000-0000-7000-8000-000000000003',
      outcome: 'failed',
    });

    expect(checkpoint.state).toBe('resolved');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/case when state = 'resuming' then \$3 else state end/i),
      expect.any(Array),
    );
  });

  it('releases an unused lease so a pre-execution failure can be retried', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ ...CHECKPOINT_ROW, state: 'pending' }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input' }]);

    const checkpoint = await releaseCloudAgentApprovalCheckpoint(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      checkpointId: CHECKPOINT_ROW.id,
      leaseToken: '0190a000-0000-7000-8000-000000000003',
    });

    expect(checkpoint.state).toBe('pending');
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/state = 'pending'[\s\S]*lease_token = null[\s\S]*state = 'resuming'/i),
      [CHECKPOINT_ROW.id, 'user-1', '0190a000-0000-7000-8000-000000000003'],
    );
  });
});
