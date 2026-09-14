import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));
vi.mock('../agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  CloudAgentApprovalCheckpointExpiredError,
  CloudAgentDeviceMismatchError,
  CloudAgentDeviceStepResultError,
  claimCloudAgentDeviceCheckpoint,
  saveCloudAgentDeviceCheckpoint,
} from '../cloud-agent-run-service';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const SESSION_ID = '0190a000-0000-7000-8000-000000000099';
const TURN_ID = 'agi.chat.desktop.send.turn-1';
const DEVICE_ID = 'device-abc';

const RUN_ROW = {
  id: RUN_ID,
  user_id: 'user-1',
  request_id: TURN_ID,
  conversation_id: SESSION_ID,
  origin_surface: 'desktop',
  work_mode: 'chat',
  state: 'running',
  provider: 'anthropic',
  model: 'claude-test',
  last_event_sequence: 2,
  cancellation_requested_at: null,
  completed_at: null,
  created_at: '2026-09-13T20:00:00.000Z',
  updated_at: '2026-09-13T20:00:01.000Z',
};

const DEVICE_STEP = {
  deviceId: DEVICE_ID,
  deviceName: 'Work MacBook',
  steps: [{ toolCallId: 'call-1', summary: 'Read notes.md in Documents' }],
};

const CHECKPOINT_ROW = {
  id: '0190a000-0000-7000-8000-000000000002',
  run_id: RUN_ID,
  user_id: 'user-1',
  version: 1,
  session_id: SESSION_ID,
  turn_id: TURN_ID,
  next_event_sequence: 6,
  completed_steps: 1,
  request: { model: 'claude-test', stream: true },
  messages: [
    { role: 'user', content: 'read my notes' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'device_read_file', arguments: '{}' },
        },
      ],
    },
  ],
  pending_tool_calls: [
    { id: 'call-1', qualifiedName: 'device_read_file', args: { rootId: 'root-1' } },
  ],
  state: 'pending',
  checkpoint_kind: 'device',
  device_step: DEVICE_STEP,
  lease_token: null,
  lease_expires_at: null,
  resolved_at: null,
  created_at: '2026-09-13T20:00:01.000Z',
  updated_at: '2026-09-13T20:00:01.000Z',
};

const base: Omit<AgentEventEnvelope, 'sequence' | 'event'> = {
  schemaVersion: 4,
  sessionId: SESSION_ID,
  turnId: TURN_ID,
  emittedAtMs: 1_757_800_000_000,
};

const DEVICE_EVENTS: AgentEventEnvelope[] = [
  {
    ...base,
    sequence: 3,
    event: {
      type: 'device-step-requested',
      toolCallId: 'call-1',
      toolName: 'device_read_file',
      deviceId: DEVICE_ID,
      deviceName: 'Work MacBook',
      summary: 'Read notes.md in Documents',
      input: { rootId: 'root-1', path: 'notes.md' },
      expiresAtMs: 1_757_800_900_000,
    },
  },
  {
    ...base,
    sequence: 4,
    event: {
      type: 'task-state-changed',
      taskId: TURN_ID,
      state: 'awaiting_input',
      previousState: 'running',
      summary: 'The agent is waiting for a step to run on your device.',
    },
  },
  { ...base, sequence: 5, event: { type: 'lifecycle', phase: 'paused' } },
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

function saveArgs(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    runId: RUN_ID,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    nextEventSequence: 6,
    completedSteps: 1,
    request: CHECKPOINT_ROW.request,
    messages: CHECKPOINT_ROW.messages,
    pendingToolCalls: CHECKPOINT_ROW.pending_tool_calls,
    deviceStep: DEVICE_STEP,
    events: DEVICE_EVENTS,
    ...overrides,
  };
}

describe('cloud agent device checkpoints', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    db = database();
  });

  it('stores the device binding alongside the paused call', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: RUN_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ next_version: 1 }])
      .mockResolvedValueOnce([CHECKPOINT_ROW])
      .mockResolvedValueOnce(DEVICE_EVENTS.map(({ sequence }) => ({ sequence })))
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input', last_event_sequence: 5 }])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'awaiting_input' }]);

    const checkpoint = await saveCloudAgentDeviceCheckpoint(db, saveArgs());

    expect(checkpoint.deviceStep).toEqual(DEVICE_STEP);
    expect(db.query).toHaveBeenNthCalledWith(
      4,
      expect.stringMatching(/checkpoint_kind, device_step[\s\S]*'device'/i),
      expect.arrayContaining([JSON.stringify(DEVICE_STEP)]),
    );
  });

  it('refuses a boundary whose events name a different device', async () => {
    await expect(
      saveCloudAgentDeviceCheckpoint(
        db,
        saveArgs({
          events: [
            {
              ...DEVICE_EVENTS[0]!,
              event: { ...DEVICE_EVENTS[0]!.event, deviceId: 'other-device' },
            },
            DEVICE_EVENTS[1]!,
            DEVICE_EVENTS[2]!,
          ],
        }),
      ),
    ).rejects.toThrow(/complete device boundary/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a claim from a second device', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([CHECKPOINT_ROW]);

    await expect(
      claimCloudAgentDeviceCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ID,
        deviceId: 'a-different-machine',
        results: [{ toolCallId: 'call-1', content: 'notes', isError: false }],
      }),
    ).rejects.toBeInstanceOf(CloudAgentDeviceMismatchError);
  });

  it('refuses results that do not match the paused calls', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([CHECKPOINT_ROW]);

    await expect(
      claimCloudAgentDeviceCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ID,
        deviceId: DEVICE_ID,
        results: [{ toolCallId: 'call-unknown', content: 'notes', isError: false }],
      }),
    ).rejects.toBeInstanceOf(CloudAgentDeviceStepResultError);
  });

  it('reports an expired pause rather than a missing one', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: CHECKPOINT_ROW.id }]);

    await expect(
      claimCloudAgentDeviceCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ID,
        deviceId: DEVICE_ID,
        results: [{ toolCallId: 'call-1', content: 'notes', isError: false }],
      }),
    ).rejects.toBeInstanceOf(CloudAgentApprovalCheckpointExpiredError);
  });

  it('scopes the claim to the caller and leases it once', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([CHECKPOINT_ROW])
      .mockResolvedValueOnce([
        {
          ...CHECKPOINT_ROW,
          state: 'resuming',
          lease_token: '0190a000-0000-7000-8000-0000000000aa',
        },
      ])
      .mockResolvedValueOnce([{ ...RUN_ROW, state: 'running' }]);

    const claim = await claimCloudAgentDeviceCheckpoint(db, {
      userId: 'user-1',
      runId: RUN_ID,
      deviceId: DEVICE_ID,
      results: [{ toolCallId: 'call-1', content: 'the notes', isError: false }],
    });

    expect(claim.leaseToken).toBe('0190a000-0000-7000-8000-0000000000aa');
    expect(claim.results).toEqual([{ toolCallId: 'call-1', content: 'the notes', isError: false }]);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/checkpoint_kind = 'device'[\s\S]*make_interval\(mins => \$3\)/i),
      [RUN_ID, 'user-1', expect.any(Number)],
    );
  });
});
