import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), warn: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}));
vi.mock('./agent-notification-service', () => ({
  notifyAgentRunEvent: (...args: unknown[]) => mocks.notify(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  saveCloudAgentApprovalCheckpoint,
  saveCloudAgentInputCheckpoint,
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
  messages: [{ role: 'user', content: 'inspect the repository' }],
  pending_tool_calls: [{ id: 'call-1', qualifiedName: 'mcp__github__read_file', args: {} }],
  state: 'pending',
  lease_token: null,
  lease_expires_at: null,
  resolved_at: null,
  created_at: '2026-07-17T20:00:01.000Z',
  updated_at: '2026-07-17T20:00:01.000Z',
};

const envelope: AgentEventEnvelope = {
  schemaVersion: 4,
  sessionId: RUN_ROW.conversation_id,
  turnId: RUN_ROW.request_id,
  sequence: 3,
  emittedAtMs: 1_752_780_000_000,
  event: { type: 'lifecycle', phase: 'paused' },
};

const PAUSE_TAIL: AgentEventEnvelope[] = [
  {
    ...envelope,
    sequence: 4,
    event: {
      type: 'task-state-changed',
      taskId: RUN_ROW.request_id,
      state: 'awaiting_input',
      previousState: 'running',
      summary: 'The agent needs you before it can continue.',
    },
  },
  { ...envelope, sequence: 5, event: { type: 'lifecycle', phase: 'paused' } },
];

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
  ...PAUSE_TAIL,
];

const INPUT_REQUESTS = { 'call-1': { path: { type: 'string' } } };
const REQUEST_STATE = { 'call-1': { requestState: 'opaque-continuation', round: 0 } };

const INPUT_EVENTS: AgentEventEnvelope[] = [
  {
    ...envelope,
    sequence: 3,
    event: {
      type: 'input-requested',
      toolCallId: 'call-1',
      connectorId: 'github',
      toolName: 'read_file',
      inputRequests: INPUT_REQUESTS['call-1'],
      requestState: 'opaque-continuation',
      round: 0,
    },
  },
  ...PAUSE_TAIL,
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

/** The eleven statements a checkpoint save issues, in order. */
function mockCheckpointSave(db: DatabaseAdapter, checkpointRow: Record<string, unknown>): void {
  vi.mocked(db.query)
    .mockResolvedValueOnce([{ id: RUN_ROW.id }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ next_version: 1 }])
    .mockResolvedValueOnce([checkpointRow])
    .mockResolvedValueOnce([{ sequence: 3 }])
    .mockResolvedValueOnce([{ ...RUN_ROW, last_event_sequence: 3 }])
    .mockResolvedValueOnce([{ sequence: 4 }])
    .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 4 }])
    .mockResolvedValueOnce([{ sequence: 5 }])
    .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 5 }])
    .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input' }]);
}

function approvalSaveArgs() {
  return {
    userId: 'user-1',
    runId: RUN_ROW.id,
    sessionId: RUN_ROW.conversation_id,
    turnId: RUN_ROW.request_id,
    nextEventSequence: 6,
    completedSteps: 1,
    request: CHECKPOINT_ROW.request,
    messages: CHECKPOINT_ROW.messages,
    pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
    events: APPROVAL_EVENTS,
  };
}

function inputSaveArgs() {
  return {
    ...approvalSaveArgs(),
    inputRequests: INPUT_REQUESTS,
    requestState: REQUEST_STATE,
    events: INPUT_EVENTS,
  };
}

describe('cloud agent run notifications', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notify.mockResolvedValue({ pushed: true });
    db = database();
  });

  it('notifies when a run pauses awaiting approval', async () => {
    mockCheckpointSave(db, CHECKPOINT_ROW);

    await saveCloudAgentApprovalCheckpoint(db, approvalSaveArgs());

    expect(mocks.notify).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      event: 'approval_required',
      toolName: 'mcp__github__read_file',
    });
  });

  it('notifies when a run pauses awaiting input', async () => {
    mockCheckpointSave(db, {
      ...CHECKPOINT_ROW,
      checkpoint_kind: 'input',
      input_requests: INPUT_REQUESTS,
      request_state: REQUEST_STATE,
    });

    await saveCloudAgentInputCheckpoint(db, inputSaveArgs());

    expect(mocks.notify).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      event: 'input_required',
      toolName: 'mcp__github__read_file',
    });
  });

  it('notifies when a run completes and when it fails', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'completed', previous_state: 'running' }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'failed', previous_state: 'running' }]);

    await transitionCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id, state: 'completed' });
    await transitionCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id, state: 'failed' });

    expect(mocks.notify).toHaveBeenNthCalledWith(1, db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      event: 'completed',
    });
    expect(mocks.notify).toHaveBeenNthCalledWith(2, db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      event: 'failed',
    });
  });

  it('reads the pre-update state so a repeated terminal transition notifies once', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...RUN_ROW, state: 'completed', previous_state: 'completed' },
    ]);

    await transitionCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id, state: 'completed' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/previous\.state as previous_state/i),
      [RUN_ROW.id, 'user-1', 'completed'],
    );
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stays silent for a cancellation the user asked for', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...RUN_ROW, state: 'cancelled', previous_state: 'running' },
    ]);

    await transitionCloudAgentRun(db, { userId: 'user-1', runId: RUN_ROW.id, state: 'cancelled' });

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('never lets a notification failure break the pause boundary', async () => {
    mocks.notify.mockRejectedValue(new Error('expo is down'));
    mockCheckpointSave(db, CHECKPOINT_ROW);

    const checkpoint = await saveCloudAgentApprovalCheckpoint(db, approvalSaveArgs());

    expect(checkpoint.id).toBe(CHECKPOINT_ROW.id);
    expect(checkpoint.state).toBe('pending');
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ROW.id }),
      expect.stringMatching(/notification failed/i),
    );
  });

  it('never lets a notification failure break a terminal transition', async () => {
    mocks.notify.mockRejectedValue(new Error('expo is down'));
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...RUN_ROW, state: 'failed', previous_state: 'running' },
    ]);

    const run = await transitionCloudAgentRun(db, {
      userId: 'user-1',
      runId: RUN_ROW.id,
      state: 'failed',
    });

    expect(run.state).toBe('failed');
  });
});
