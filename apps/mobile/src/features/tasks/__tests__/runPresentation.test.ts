jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import {
  AgentTaskStateSchema,
  CloudAgentOriginSurfaceSchema,
  CloudAgentWorkModeSchema,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  cloudRunBlock,
  cloudRunFilterStates,
  cloudRunTextDelta,
  cloudRunTitle,
  groupCloudRunsByRecency,
  isCloudRunSteerable,
  mergeCloudRuns,
  summarizeCloudRunEvent,
  ALL_CLOUD_RUN_STATES,
  CLOUD_RUN_FILTERS,
  CLOUD_RUN_ORIGIN_LABELS,
  CLOUD_RUN_STATE_LABELS,
  CLOUD_RUN_WORK_MODE_LABELS,
} from '../runPresentation';

// The list endpoint validates `state` with `z.array(AgentTaskStateSchema).max(9)`.
const MAX_LIST_STATES = 9;

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

function cloudRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: '01920000-0000-7000-8000-000000000001',
    userId: 'user_1',
    requestId: 'req_1',
    conversationId: null,
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'running',
    provider: 'managed',
    model: 'test-model',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function envelope(event: AgentEventEnvelope['event'], sequence = 0): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: 'session_1',
    turnId: 'turn_1',
    sequence,
    emittedAtMs: NOW,
    event,
  };
}

describe('cloud run filters', () => {
  it('asks for every task state on the unfiltered view', () => {
    expect([...cloudRunFilterStates('all')].sort()).toEqual(
      [...AgentTaskStateSchema.options].sort(),
    );
    expect(ALL_CLOUD_RUN_STATES).toHaveLength(MAX_LIST_STATES);
  });

  it('partitions every task state across the narrow filters exactly once', () => {
    const narrow = CLOUD_RUN_FILTERS.filter((filter) => filter.key !== 'all').flatMap((filter) => [
      ...filter.states,
    ]);
    expect([...narrow].sort()).toEqual([...AgentTaskStateSchema.options].sort());
  });

  it('falls back to the unfiltered view for an unknown key', () => {
    expect(cloudRunFilterStates('nope' as never)).toEqual([...ALL_CLOUD_RUN_STATES]);
  });
});

describe('cloud run labels', () => {
  it('labels every state, origin surface and work mode in the contract', () => {
    for (const state of AgentTaskStateSchema.options) {
      expect(CLOUD_RUN_STATE_LABELS[state]).toBeTruthy();
    }
    for (const surface of CloudAgentOriginSurfaceSchema.options) {
      expect(CLOUD_RUN_ORIGIN_LABELS[surface]).toBeTruthy();
    }
    for (const workMode of CloudAgentWorkModeSchema.options) {
      expect(CLOUD_RUN_WORK_MODE_LABELS[workMode]).toBeTruthy();
    }
  });

  it('prefers the conversation title and falls back to the work mode', () => {
    expect(cloudRunTitle(cloudRun(), 'Quarterly review')).toBe('Quarterly review');
    expect(cloudRunTitle(cloudRun(), '   ')).toBe('AGI work task');
    expect(cloudRunTitle(cloudRun({ workMode: 'research' }))).toBe('Research task');
  });
});

describe('cloud run blocking', () => {
  it('reports the pause that is blocking the run', () => {
    expect(cloudRunBlock(cloudRun())).toBeNull();
    expect(
      cloudRunBlock(
        cloudRun({
          state: 'awaiting_input',
          pendingApproval: {
            requestedAt: new Date(NOW).toISOString(),
            toolCalls: [{ toolCallId: 'call_1', name: 'shell', argsPreview: 'ls' }],
          },
        }),
      ),
    ).toBe('approval');
    expect(
      cloudRunBlock(
        cloudRun({
          state: 'awaiting_input',
          pendingInput: {
            requestedAt: new Date(NOW).toISOString(),
            toolCalls: [
              {
                toolCallId: 'call_2',
                name: 'connector',
                connectorId: 'conn_1',
                round: 0,
                inputRequests: { code: {} },
              },
            ],
          },
        }),
      ),
    ).toBe('input');
  });

  it('treats only unfinished runs as steerable', () => {
    expect(isCloudRunSteerable(cloudRun({ state: 'queued' }))).toBe(true);
    expect(isCloudRunSteerable(cloudRun({ state: 'paused' }))).toBe(true);
    expect(isCloudRunSteerable(cloudRun({ state: 'completed' }))).toBe(false);
    expect(isCloudRunSteerable(cloudRun({ state: 'ready_for_review' }))).toBe(false);
  });
});

describe('cloud run grouping', () => {
  it('groups by last activity and keeps the newest first', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const older = cloudRun({ id: 'older', updatedAt: new Date(NOW - 10 * dayMs).toISOString() });
    const today = cloudRun({ id: 'today', updatedAt: new Date(NOW).toISOString() });
    const sections = groupCloudRunsByRecency([older, today]);

    expect(sections[0].title).toBe('Today');
    expect(sections[0].data[0].id).toBe('today');
    expect(sections[sections.length - 1].title).toBe('Older');
  });

  it('merges an appended page without duplicating a run', () => {
    const first = cloudRun({ id: 'a' });
    const updated = cloudRun({ id: 'a', state: 'completed' });
    const second = cloudRun({ id: 'b' });

    const merged = mergeCloudRuns([first], [updated, second]);
    expect(merged).toHaveLength(2);
    expect(merged[0].state).toBe('completed');
  });
});

describe('cloud run event summaries', () => {
  it('collects assistant text only from text deltas', () => {
    expect(cloudRunTextDelta(envelope({ type: 'text-delta', delta: 'hello' }))).toBe('hello');
    expect(cloudRunTextDelta(envelope({ type: 'lifecycle', phase: 'started' }))).toBe('');
  });

  it('summarizes the events a reader can act on and ignores the rest', () => {
    expect(
      summarizeCloudRunEvent(
        envelope(
          {
            type: 'tool-execution-start',
            toolCallId: 'call_1',
            name: 'shell',
            category: 'shell',
            summary: 'Listing files',
            input: {},
          },
          3,
        ),
      ),
    ).toEqual({ id: 'turn_1:3', label: 'Listing files', tone: 'default' });

    expect(summarizeCloudRunEvent(envelope({ type: 'error', message: 'Upstream failed' }))).toEqual(
      {
        id: 'turn_1:0',
        label: 'Upstream failed',
        tone: 'error',
      },
    );

    expect(summarizeCloudRunEvent(envelope({ type: 'text-delta', delta: 'hi' }))).toBeNull();
    expect(summarizeCloudRunEvent(envelope({ type: 'lifecycle', phase: 'heartbeat' }))).toBeNull();
  });

  it('names an approval decision in plain language', () => {
    expect(
      summarizeCloudRunEvent(
        envelope({ type: 'approval-resolved', approvalId: 'a1', decision: 'approved-for-session' }),
      ),
    ).toEqual({ id: 'turn_1:0', label: 'Approved for this session', tone: 'success' });
  });
});
