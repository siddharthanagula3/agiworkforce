import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// Pause and terminal boundaries now announce to mobile. The wiring itself is
// covered in cloud-agent-run-notifications.test.ts; stub it here so these
// cases keep asserting storage behaviour against a mocked database only.
vi.mock('./agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  APPROVAL_CHECKPOINT_TTL_HOURS,
  appendCloudAgentEvent,
  appendCloudAgentEvents,
  claimCloudAgentApprovalCheckpoint,
  claimCloudAgentInputCheckpoint,
  completeCloudAgentApprovalCheckpoint,
  completeCloudAgentInputCheckpoint,
  saveCloudAgentInputCheckpoint,
  createCloudAgentRun,
  findActiveCloudAgentRunForConversation,
  getCloudAgentRun,
  listCloudAgentRuns,
  readCloudAgentRunAssistantText,
  recordCloudAgentRunSettledUsage,
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
  schemaVersion: 4,
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
      [RUN_ROW.id, 'user-1', 2, 'ready_for_review', 2],
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
      expect.stringMatching(
        /when \$4::text is not null and \$5::bigint >= runs\.last_event_sequence/i,
      ),
      [RUN_ROW.id, 'user-1', 2, 'ready_for_review', 2],
    );
    expect(run.state).toBe('ready_for_review');
    expect(run.lastEventSequence).toBe(3);
  });

  it('journals a batch as one multi-row insert and one run update', async () => {
    const deltas = [1, 2, 3].map((sequence) => ({
      ...envelope,
      sequence,
      event: { type: 'text-delta' as const, delta: `chunk-${sequence}` },
    }));
    vi.mocked(db.query)
      .mockResolvedValueOnce(deltas.map(({ sequence }) => ({ sequence })))
      .mockResolvedValueOnce([{ ...RUN_ROW, last_event_sequence: 3 }]);

    const run = await appendCloudAgentEvents(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      envelopes: deltas,
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/insert into public\.cloud_agent_events/i),
      [
        RUN_ROW.id,
        'user-1',
        ...deltas.flatMap((delta) => [delta.sequence, delta.emittedAtMs, delta.event.type, delta]),
      ],
    );
    // No `task-state-changed` in the batch, so the state stays where it was and
    // only `last_event_sequence` advances — to the batch's highest sequence.
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/update public\.cloud_agent_runs/i),
      [RUN_ROW.id, 'user-1', 3, null, 3],
    );
    expect(run.lastEventSequence).toBe(3);
  });

  it('ignores a state envelope in a batch whose own insert lost the sequence race', async () => {
    const batch = [
      { ...envelope, sequence: 1, event: { type: 'text-delta' as const, delta: 'hi' } },
      envelope,
    ];
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ sequence: 1 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running', last_event_sequence: 2 }]);

    await appendCloudAgentEvents(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      envelopes: batch,
    });

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/update public\.cloud_agent_runs/i),
      [RUN_ROW.id, 'user-1', envelope.sequence, null, envelope.sequence],
    );
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

  describe('pending approval inbox', () => {
    const PENDING_ROW = {
      ...RUN_ROW,
      state: 'awaiting_input',
      pending_approval_requested_at: '2026-07-17T20:05:00.000Z',
      pending_approval_tool_calls: [
        {
          id: 'call-1',
          qualifiedName: 'mcp__github__create_issue',
          args: { repo: 'agiworkforce/app', title: 'Ship durable sessions' },
        },
      ],
    };

    it('summarizes the outstanding approval so a surface that never streamed the run can act', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([PENDING_ROW]);

      const result = await listCloudAgentRuns(db, {
        userId: 'user-1',
        states: ['awaiting_input'],
      });

      expect(result.runs[0]?.pendingApproval).toEqual({
        requestedAt: '2026-07-17T20:05:00.000Z',
        toolCalls: [
          {
            toolCallId: 'call-1',
            name: 'mcp__github__create_issue',
            argsPreview: '{"repo":"agiworkforce/app","title":"Ship durable sessions"}',
          },
        ],
      });
    });

    it('truncates the argument preview server-side rather than shipping whole tool payloads', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          ...PENDING_ROW,
          pending_approval_tool_calls: [
            { id: 'call-1', qualifiedName: 'fs_write', args: { body: 'x'.repeat(5_000) } },
          ],
        },
      ]);

      const result = await listCloudAgentRuns(db, { userId: 'user-1', states: ['awaiting_input'] });

      expect(result.runs[0]?.pendingApproval?.toolCalls[0]?.argsPreview).toHaveLength(300);
    });

    it('hides an approval that has aged past the claim window instead of offering a dead button', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([PENDING_ROW]);

      await listCloudAgentRuns(db, { userId: 'user-1', states: ['awaiting_input'] });

      const [sql] = vi.mocked(db.query).mock.calls[0]!;
      expect(sql).toMatch(
        /state = 'pending'[\s\S]*created_at > now\(\) - make_interval\(hours =>/i,
      );
    });

    it('omits the summary once the checkpoint has been claimed', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          ...PENDING_ROW,
          state: 'running',
          pending_approval_requested_at: null,
          pending_approval_tool_calls: null,
        },
      ]);

      const result = await listCloudAgentRuns(db, { userId: 'user-1', states: ['running'] });

      expect(result.runs[0]?.pendingApproval).toBeUndefined();
    });

    it('attaches the same summary to a single-run read so a relaunched client can rebuild the card', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([PENDING_ROW]).mockResolvedValueOnce([]);

      const result = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id });

      expect(result?.run.pendingApproval?.toolCalls[0]?.toolCallId).toBe('call-1');
    });
  });

  describe('assistant text aggregation', () => {
    it('concatenates the journalled answer in sequence order with its replay cursor', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { text: 'Hello, world.', last_sequence: '41', interactive_cards: [] },
      ]);

      const result = await readCloudAgentRunAssistantText(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
      });

      expect(result).toEqual({ text: 'Hello, world.', lastSequence: 41, interactiveCards: [] });
      const [sql, params] = vi.mocked(db.query).mock.calls[0]!;
      expect(sql).toMatch(/string_agg\(envelope->'event'->>'delta', '' order by sequence\)/i);
      expect(sql).toMatch(/envelope->'event'->>'type' = 'text-delta'/i);
      expect(sql).toMatch(/cloud_agent_execution_operations/i);
      expect(sql).toMatch(/result->'interactiveCard'/i);
      expect(params).toEqual([RUN_ROW.id, 'user-1']);
    });

    it('reports an empty answer and a null cursor for a run with no journalled events', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { text: '', last_sequence: -1, interactive_cards: [] },
      ]);

      await expect(
        readCloudAgentRunAssistantText(db, { userId: 'user-1', runId: RUN_ROW.id }),
      ).resolves.toEqual({ text: '', lastSequence: -1, interactiveCards: [] });
    });

    it('salvages validated cards from durable tool receipts and drops malformed entries', async () => {
      const card = {
        schemaVersion: 1,
        cardId: 'tool-map-fixture',
        kind: 'map-search.v1',
        createdAt: '2026-08-11T00:00:00.000Z',
        fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
        producedBy: { toolCallId: 'tool-map-fixture', toolName: 'search_maps' },
        body: {
          title: 'Coffee near Austin',
          query: 'coffee near Austin',
          actions: [
            {
              provider: 'openstreetmap',
              label: 'Open in OpenStreetMap',
              url: 'https://www.openstreetmap.org/search?query=coffee%20near%20Austin',
            },
          ],
        },
      };
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          text: 'Choose a map.',
          last_sequence: 7,
          interactive_cards: [{ arbitrary: true }, card],
        },
      ]);

      const result = await readCloudAgentRunAssistantText(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
      });

      expect(result.interactiveCards).toHaveLength(1);
      expect(result.interactiveCards[0]).toMatchObject({
        cardId: 'tool-map-fixture',
        recognized: true,
      });
    });
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
        /runs\.user_id = \$1[\s\S]*runs\.state = any\(\$2::text\[\]\)[\s\S]*runs\.request_id = \$3[\s\S]*\(runs\.updated_at, runs\.id\) < \(\$4::timestamptz, \$5::uuid\)[\s\S]*runs\.work_mode = any\(\$7::text\[\]\)/i,
      ),
      [
        'user-1',
        ['awaiting_input', 'ready_for_review'],
        null,
        '2026-07-17T20:00:00.000Z',
        '0190a000-0000-7000-8000-000000000099',
        2,
        null,
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
      /where runs\.user_id = \$1[\s\S]*runs\.state = any\(\$2::text\[\]\)[\s\S]*runs\.request_id = \$3/i,
    );
    expect(params).toEqual([
      'user-1',
      ['completed', 'cancelled'],
      RUN_ROW.request_id,
      null,
      null,
      2,
      null,
    ]);
  });

  describe('settled per-task usage and cost', () => {
    it('leaves usage absent while a run has settled nothing', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ ...RUN_ROW, settled_usage: {} }])
        .mockResolvedValueOnce([]);

      const run = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id });

      expect(run?.run.usage).toBeUndefined();
    });

    it('adds every settlement up so a resumed run is priced as one task', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          ...RUN_ROW,
          settled_usage: {
            'agi.chat.web.turn-1': {
              providerCalls: 2,
              inputTokens: 1_200,
              outputTokens: 340,
              reasoningTokens: 64,
              costCents: 7,
              settledAt: '2026-07-17T20:00:05.000Z',
            },
            'agi.chat.web.turn-1.resume-1': {
              providerCalls: 3,
              inputTokens: 900,
              outputTokens: 210,
              reasoningTokens: 0,
              costCents: 4,
              settledAt: '2026-07-17T20:09:00.000Z',
            },
          },
        },
      ]);

      const result = await listCloudAgentRuns(db, {
        userId: 'user-1',
        states: ['ready_for_review'],
        limit: 5,
      });

      expect(result.runs[0]?.usage).toEqual({
        providerCalls: 5,
        inputTokens: 2_100,
        outputTokens: 550,
        reasoningTokens: 64,
        costCents: 11,
        settledAt: '2026-07-17T20:09:00.000Z',
      });
    });

    it('reports no charge when every settlement was metered against a free trial', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            ...RUN_ROW,
            settled_usage: {
              'agi.chat.web.turn-1': {
                providerCalls: 1,
                inputTokens: 500,
                outputTokens: 120,
                reasoningTokens: 0,
                costCents: null,
                settledAt: '2026-07-17T20:00:05.000Z',
              },
            },
          },
        ])
        .mockResolvedValueOnce([]);

      const run = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id });

      expect(run?.run.usage).toMatchObject({ costCents: null, inputTokens: 500 });
    });

    it('overwrites its own key so a retried settlement never double-charges the task', async () => {
      const settled = {
        providerCalls: 2,
        inputTokens: 1_200,
        outputTokens: 340,
        reasoningTokens: 0,
        costCents: 7,
        settledAt: '2026-07-17T20:00:05.000Z',
      };
      vi.mocked(db.query).mockResolvedValueOnce([
        { ...RUN_ROW, settled_usage: { 'agi.chat.web.turn-1': settled } },
      ]);

      const run = await recordCloudAgentRunSettledUsage(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        billingIdempotencyKey: 'agi.chat.web.turn-1',
        usage: {
          providerCalls: 2,
          inputTokens: 1_200,
          outputTokens: 340,
          reasoningTokens: 0,
          costCents: 7,
        },
      });

      const [sql, params] = vi.mocked(db.query).mock.calls[0]!;
      expect(sql).toMatch(
        /settled_usage = settled_usage \|\| jsonb_build_object\(\$3::text, \$4::jsonb\)/i,
      );
      expect(params?.[0]).toBe(RUN_ROW.id);
      expect(params?.[1]).toBe('user-1');
      expect(params?.[2]).toBe('agi.chat.web.turn-1');
      expect(params?.[3]).toMatchObject({
        providerCalls: 2,
        inputTokens: 1_200,
        outputTokens: 340,
        reasoningTokens: 0,
        costCents: 7,
      });
      expect(run?.usage).toMatchObject({ costCents: 7, providerCalls: 2 });
    });

    it('does not fail settlement when the run row is already gone', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      await expect(
        recordCloudAgentRunSettledUsage(db, {
          userId: 'user-1',
          runId: RUN_ROW.id,
          billingIdempotencyKey: 'agi.chat.web.turn-1',
          usage: {
            providerCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            costCents: null,
          },
        }),
      ).resolves.toBeNull();
    });
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
      .mockResolvedValueOnce(APPROVAL_EVENTS.map(({ sequence }) => ({ sequence })))
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
      7,
      expect.stringMatching(/state = 'awaiting_input'/i),
      [RUN_ROW.id, 'user-1'],
    );
    // All three checkpoint events land in ONE insert, not one transaction each.
    expect(db.query).toHaveBeenNthCalledWith(
      5,
      expect.stringMatching(/insert into public\.cloud_agent_events/i),
      [
        RUN_ROW.id,
        'user-1',
        ...APPROVAL_EVENTS.flatMap((event) => [
          event.sequence,
          event.emittedAtMs,
          event.event.type,
          event,
        ]),
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

  describe('MRTR input checkpoints', () => {
    const INPUT_EVENTS: AgentEventEnvelope[] = [
      {
        ...envelope,
        sequence: 3,
        event: {
          type: 'input-requested',
          toolCallId: 'call-1',
          connectorId: 'github',
          toolName: 'read_file',
          inputRequests: { path: { type: 'string' } },
          requestState: 'opaque-continuation',
          round: 0,
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
          summary: 'The agent needs additional input before it can continue.',
        },
      },
      {
        ...envelope,
        sequence: 5,
        event: { type: 'lifecycle', phase: 'paused' },
      },
    ];

    const INPUT_REQUESTS = { 'call-1': { path: { type: 'string' } } };
    const REQUEST_STATE = { 'call-1': { requestState: 'opaque-continuation', round: 0 } };

    const INPUT_CHECKPOINT_ROW = {
      ...CHECKPOINT_ROW,
      checkpoint_kind: 'input',
      input_requests: INPUT_REQUESTS,
      request_state: REQUEST_STATE,
    };

    function saveArgs(overrides: Record<string, unknown> = {}) {
      return {
        userId: 'user-1',
        runId: RUN_ROW.id,
        sessionId: RUN_ROW.conversation_id!,
        turnId: RUN_ROW.request_id,
        nextEventSequence: 6,
        completedSteps: 1,
        request: CHECKPOINT_ROW.request,
        messages: CHECKPOINT_ROW.messages,
        pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
        inputRequests: INPUT_REQUESTS,
        requestState: REQUEST_STATE,
        events: INPUT_EVENTS,
        ...overrides,
      };
    }

    it('versions and stores a server-owned input checkpoint under the run lock', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: RUN_ROW.id }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ next_version: 1 }])
        .mockResolvedValueOnce([INPUT_CHECKPOINT_ROW])
        .mockResolvedValueOnce(INPUT_EVENTS.map(({ sequence }) => ({ sequence })))
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 5 }])
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input' }]);

      const checkpoint = await saveCloudAgentInputCheckpoint(db, saveArgs());

      expect(checkpoint.id).toBe(CHECKPOINT_ROW.id);
      expect(checkpoint.inputRequests).toEqual(INPUT_REQUESTS);
      expect(checkpoint.requestState).toEqual(REQUEST_STATE);
      expect(db.query).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(/checkpoint_kind, input_requests, request_state[\s\S]*'input'/i),
        expect.arrayContaining([INPUT_REQUESTS, REQUEST_STATE]),
      );
      expect(db.query).toHaveBeenNthCalledWith(
        7,
        expect.stringMatching(/state = 'awaiting_input'/i),
        [RUN_ROW.id, 'user-1'],
      );
    });

    it('rejects an incomplete input boundary before opening a transaction', async () => {
      await expect(
        saveCloudAgentInputCheckpoint(
          db,
          saveArgs({
            events: [INPUT_EVENTS[0]!, INPUT_EVENTS[1]!, { ...INPUT_EVENTS[1]!, sequence: 5 }],
          }),
        ),
      ).rejects.toThrow(/complete input boundary/i);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a boundary whose bounded definitions do not cover every paused call', async () => {
      await expect(
        saveCloudAgentInputCheckpoint(db, saveArgs({ inputRequests: {}, requestState: {} })),
      ).rejects.toThrow(/complete input boundary/i);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('claims the latest pending input checkpoint and advances to the next round', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([INPUT_CHECKPOINT_ROW])
        .mockResolvedValueOnce([
          {
            ...INPUT_CHECKPOINT_ROW,
            state: 'resuming',
            lease_token: '0190a000-0000-7000-8000-000000000003',
            lease_expires_at: '2026-07-18T20:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running' }]);

      const claimed = await claimCloudAgentInputCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        inputs: [{ toolCallId: 'call-1', inputResponses: { path: 'README.md' } }],
        leaseSeconds: 86_400,
      });

      expect(claimed.checkpoint.state).toBe('resuming');
      expect(claimed.leaseToken).toBe('0190a000-0000-7000-8000-000000000003');
      expect(claimed.resumptions).toEqual([
        {
          toolCallId: 'call-1',
          inputResponses: { path: 'README.md' },
          requestState: 'opaque-continuation',
          round: 1,
        },
      ]);
      expect(db.query).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /checkpoint_kind = 'input'[\s\S]*state = 'pending'[\s\S]*for update/i,
        ),
        [RUN_ROW.id, 'user-1', APPROVAL_CHECKPOINT_TTL_HOURS],
      );
    });

    it('supports repeated MRTR rounds by scoping the next attempt round', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            ...INPUT_CHECKPOINT_ROW,
            request_state: { 'call-1': { requestState: 't2', round: 2 } },
          },
        ])
        .mockResolvedValueOnce([
          {
            ...INPUT_CHECKPOINT_ROW,
            request_state: { 'call-1': { requestState: 't2', round: 2 } },
            state: 'resuming',
            lease_token: '0190a000-0000-7000-8000-000000000003',
            lease_expires_at: '2026-07-18T20:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running' }]);

      const claimed = await claimCloudAgentInputCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ROW.id,
        inputs: [{ toolCallId: 'call-1', inputResponses: { path: 'CHANGELOG.md' } }],
      });

      expect(claimed.resumptions[0]).toMatchObject({ round: 3, requestState: 't2' });
    });

    it('rejects a forged input tool call id before claiming the checkpoint', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([INPUT_CHECKPOINT_ROW]);

      await expect(
        claimCloudAgentInputCheckpoint(db, {
          userId: 'user-1',
          runId: RUN_ROW.id,
          inputs: [{ toolCallId: 'call-forged', inputResponses: {} }],
        }),
      ).rejects.toMatchObject({ name: 'CloudAgentInputResponseError' });
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('rejects a cross-user or missing input checkpoint as not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(
        claimCloudAgentInputCheckpoint(db, {
          userId: 'other-user',
          runId: RUN_ROW.id,
          inputs: [{ toolCallId: 'call-1', inputResponses: {} }],
        }),
      ).rejects.toMatchObject({ name: 'CloudAgentApprovalCheckpointNotFoundError' });
    });

    it('rejects an input checkpoint that has aged past the claim window', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: INPUT_CHECKPOINT_ROW.id }]);

      await expect(
        claimCloudAgentInputCheckpoint(db, {
          userId: 'user-1',
          runId: RUN_ROW.id,
          inputs: [{ toolCallId: 'call-1', inputResponses: {} }],
        }),
      ).rejects.toMatchObject({ name: 'CloudAgentApprovalCheckpointExpiredError' });
    });

    it('settles the input checkpoint lease as failed when the run is cancelled', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ ...INPUT_CHECKPOINT_ROW, state: 'failed' }]);

      const checkpoint = await completeCloudAgentInputCheckpoint(db, {
        userId: 'user-1',
        checkpointId: INPUT_CHECKPOINT_ROW.id,
        leaseToken: '0190a000-0000-7000-8000-000000000003',
        outcome: 'failed',
      });

      expect(checkpoint.state).toBe('failed');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/case when state = 'resuming' then \$3 else state end/i),
        [INPUT_CHECKPOINT_ROW.id, 'user-1', 'failed', '0190a000-0000-7000-8000-000000000003'],
      );
    });

    it('projects a pending input inbox so a surface can collect the responses', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            ...RUN_ROW,
            state: 'awaiting_input',
            pending_input_requested_at: '2026-07-17T20:00:05.000Z',
            pending_input_tool_calls: CHECKPOINT_ROW.pending_tool_calls,
            pending_input_requests: INPUT_REQUESTS,
            pending_input_request_state: REQUEST_STATE,
          },
        ])
        .mockResolvedValueOnce([]);

      const snapshot = await getCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id });

      expect(snapshot?.run.pendingInput?.toolCalls).toEqual([
        {
          toolCallId: 'call-1',
          name: 'mcp__github__read_file',
          connectorId: 'github',
          round: 0,
          inputRequests: { path: { type: 'string' } },
        },
      ]);
    });
  });
});
