/**
 * Agent Task Lifecycle — E2E Smoke Tests
 *
 * Tests the Wave 1 8-state lifecycle for AgentTaskStore:
 *  pending → running → completed / failed / cancelled / paused / expired / recovering
 *
 * Scenarios covered:
 *  - Task starts in pending, moves to running after getTaskStatus update
 *  - Running task can be paused or cancelled
 *  - Paused task can be resumed (back to running) or abandoned (cancelled)
 *  - Failed task can be retried from checkpoint or restarted from beginning
 *  - Expired task shows correct status and checkpoint fields
 *  - Recovery actions work correctly (retryFromCheckpoint, restartFromBeginning)
 *  - isRecoverable correctly identifies recoverable states
 *  - getStatusLabel returns human-readable strings for all 8 states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useAgentTaskStore, type AgentTaskStatus } from '../stores/agentTaskStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedTask(id: string, status: AgentTaskStatus, overrides: Record<string, unknown> = {}) {
  useAgentTaskStore.setState((state) => ({
    tasks: [
      ...state.tasks,
      {
        id,
        goal: 'Lifecycle test goal',
        status,
        createdAt: new Date().toISOString(),
        iterations: 3,
        ...overrides,
      },
    ],
  }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useAgentTaskStore.setState({ tasks: [], loading: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Task starts pending, moves to running
// ---------------------------------------------------------------------------

describe('task state transitions — pending to running', () => {
  it('submitGoal creates a task in pending state', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ goalId: 'goal-abc-123' });

    const taskId = await useAgentTaskStore.getState().submitGoal('Test task');

    expect(taskId).toBe('goal-abc-123');
    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('pending');
    expect(task?.goal).toBe('Test task');
    expect(task?.createdAt).toBeDefined();
  });

  it('getTaskStatus updates task to running when backend returns running', async () => {
    const taskId = makeId();
    seedTask(taskId, 'pending');

    vi.mocked(invoke).mockResolvedValueOnce({
      context: { currentIteration: 1, status: 'running' },
    });

    await useAgentTaskStore.getState().getTaskStatus(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('running');
    expect(task?.iterations).toBe(1);
  });

  it('getTaskStatus updates task to completed', async () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    vi.mocked(invoke).mockResolvedValueOnce({
      context: { currentIteration: 5, status: 'completed', result: 'All done.' },
    });

    await useAgentTaskStore.getState().getTaskStatus(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('All done.');
    expect(task?.completedAt).toBeDefined();
  });

  it('getTaskStatus returns null if invoke fails', async () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend unreachable'));

    const result = await useAgentTaskStore.getState().getTaskStatus(taskId);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Running task can be paused or cancelled
// ---------------------------------------------------------------------------

describe('running task — pause and cancel', () => {
  it('pauseTask transitions running → paused', () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    useAgentTaskStore.getState().pauseTask(taskId, 'User paused');

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('paused');
    expect(task?.pauseReason).toBe('User paused');
  });

  it('pauseTask records last checkpoint iteration', () => {
    const taskId = makeId();
    seedTask(taskId, 'running', { iterations: 4 });

    useAgentTaskStore.getState().pauseTask(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.lastCheckpointIteration).toBe(4);
    expect(task?.lastCheckpointAt).toBeDefined();
  });

  it('pauseTask does not affect already-paused task', () => {
    const taskId = makeId();
    seedTask(taskId, 'paused', { pauseReason: 'Already paused' });

    useAgentTaskStore.getState().pauseTask(taskId, 'Should not apply');

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    // pauseTask only transitions running → paused; already-paused is not modified
    expect(task?.pauseReason).toBe('Already paused');
  });

  it('cancelTask transitions running → cancelled with completedAt', async () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useAgentTaskStore.getState().cancelTask(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('cancelled');
    expect(task?.completedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Paused task can be resumed or abandoned
// ---------------------------------------------------------------------------

describe('paused task — resume and abandon', () => {
  it('resumeTask transitions paused → running', () => {
    const taskId = makeId();
    seedTask(taskId, 'paused', { pauseReason: 'Waiting for approval' });

    useAgentTaskStore.getState().resumeTask(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('running');
    expect(task?.pauseReason).toBeUndefined();
  });

  it('abandonWithSummary transitions paused → cancelled with summary', () => {
    const taskId = makeId();
    seedTask(taskId, 'paused', {
      iterations: 3,
      result: 'Partial output',
      pauseReason: 'Waiting',
    });

    useAgentTaskStore.getState().abandonWithSummary(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('cancelled');
    expect(task?.recoverySummary).toContain('Task abandoned');
    expect(task?.recoverySummary).toContain('Partial output');
    expect(task?.completedAt).toBeDefined();
  });

  it('abandonWithSummary includes goal in summary', () => {
    const taskId = makeId();
    seedTask(taskId, 'paused');

    useAgentTaskStore.getState().abandonWithSummary(taskId);

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.recoverySummary).toContain('Lifecycle test goal');
  });
});

// ---------------------------------------------------------------------------
// 4. Failed task — retry from checkpoint and restart from beginning
// ---------------------------------------------------------------------------

describe('failed task recovery', () => {
  it('retryFromCheckpoint creates a new pending task', async () => {
    const taskId = makeId();
    seedTask(taskId, 'failed', { lastCheckpointIteration: 2, error: 'Network error' });

    vi.mocked(invoke).mockResolvedValueOnce({ goalId: 'retry-task-xyz' });

    const newTaskId = await useAgentTaskStore.getState().retryFromCheckpoint(taskId);

    expect(newTaskId).toBe('retry-task-xyz');

    const newTask = useAgentTaskStore.getState().tasks.find((t) => t.id === 'retry-task-xyz');
    expect(newTask?.status).toBe('pending');
    expect(newTask?.iterations).toBe(2); // starts from checkpoint

    // Original task should be marked cancelled with recovery summary
    const originalTask = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(originalTask?.status).toBe('cancelled');
    expect(originalTask?.recoverySummary).toContain('retry-task-xyz');
  });

  it('retryFromCheckpoint increments retryCount on the new task', async () => {
    const taskId = makeId();
    seedTask(taskId, 'failed', { retryCount: 1 });

    vi.mocked(invoke).mockResolvedValueOnce({ goalId: 'retry-task-v2' });

    await useAgentTaskStore.getState().retryFromCheckpoint(taskId);

    const newTask = useAgentTaskStore.getState().tasks.find((t) => t.id === 'retry-task-v2');
    expect(newTask?.retryCount).toBe(2);
  });

  it('retryFromCheckpoint returns null and reports error if not in recoverable state', async () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    const result = await useAgentTaskStore.getState().retryFromCheckpoint(taskId);
    expect(result).toBeNull();
  });

  it('restartFromBeginning creates a fresh pending task without checkpoint offset', async () => {
    const taskId = makeId();
    seedTask(taskId, 'failed', { lastCheckpointIteration: 5 });

    vi.mocked(invoke).mockResolvedValueOnce({ goalId: 'fresh-task-abc' });

    const newTaskId = await useAgentTaskStore.getState().restartFromBeginning(taskId);

    expect(newTaskId).toBe('fresh-task-abc');

    const freshTask = useAgentTaskStore.getState().tasks.find((t) => t.id === 'fresh-task-abc');
    expect(freshTask?.status).toBe('pending');
    expect(freshTask?.iterations).toBeUndefined(); // fresh start — no checkpoint

    const originalTask = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(originalTask?.status).toBe('cancelled');
    expect(originalTask?.recoverySummary).toContain('fresh-task-abc');
  });

  it('restartFromBeginning is blocked for running tasks', async () => {
    const taskId = makeId();
    seedTask(taskId, 'running');

    const result = await useAgentTaskStore.getState().restartFromBeginning(taskId);
    expect(result).toBeNull();
  });

  it('retryFromCheckpoint handles invoke failure gracefully', async () => {
    const taskId = makeId();
    seedTask(taskId, 'failed');

    vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend offline'));

    const result = await useAgentTaskStore.getState().retryFromCheckpoint(taskId);

    expect(result).toBeNull();

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('failed');
    expect(task?.error).toContain('Retry failed');
  });
});

// ---------------------------------------------------------------------------
// 5. Expired task
// ---------------------------------------------------------------------------

describe('expired task', () => {
  it('expireTask transitions running → expired', () => {
    const taskId = makeId();
    seedTask(taskId, 'running', { iterations: 6 });

    useAgentTaskStore.getState().expireTask(taskId, 'Approval timed out');

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('expired');
    expect(task?.pauseReason).toBe('Approval timed out');
    expect(task?.completedAt).toBeDefined();
    expect(task?.lastCheckpointIteration).toBe(6);
    expect(task?.lastCheckpointAt).toBeDefined();
  });

  it('expireTask transitions paused → expired', () => {
    const taskId = makeId();
    seedTask(taskId, 'paused', { iterations: 2 });

    useAgentTaskStore.getState().expireTask(taskId, 'Hard deadline exceeded');

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('expired');
  });

  it('expireTask does not affect completed tasks', () => {
    const taskId = makeId();
    seedTask(taskId, 'completed');

    useAgentTaskStore.getState().expireTask(taskId, 'Too late');

    const task = useAgentTaskStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe('completed');
  });

  it('expired task can be retried from checkpoint', async () => {
    const taskId = makeId();
    seedTask(taskId, 'expired', { lastCheckpointIteration: 4 });

    vi.mocked(invoke).mockResolvedValueOnce({ goalId: 'recovered-task' });

    const newId = await useAgentTaskStore.getState().retryFromCheckpoint(taskId);
    expect(newId).toBe('recovered-task');
  });
});

// ---------------------------------------------------------------------------
// 6. Recovery actions
// ---------------------------------------------------------------------------

describe('isRecoverable', () => {
  it.each([
    { status: 'failed' as AgentTaskStatus, expected: true },
    { status: 'expired' as AgentTaskStatus, expected: true },
    { status: 'paused' as AgentTaskStatus, expected: true },
    { status: 'running' as AgentTaskStatus, expected: false },
    { status: 'pending' as AgentTaskStatus, expected: false },
    { status: 'completed' as AgentTaskStatus, expected: false },
    { status: 'cancelled' as AgentTaskStatus, expected: false },
    { status: 'recovering' as AgentTaskStatus, expected: false },
  ])('isRecoverable returns $expected for status=$status', ({ status, expected }) => {
    const taskId = makeId();
    seedTask(taskId, status);

    const result = useAgentTaskStore.getState().isRecoverable(taskId);
    expect(result).toBe(expected);
  });

  it('isRecoverable returns false for unknown taskId', () => {
    expect(useAgentTaskStore.getState().isRecoverable('nonexistent-task')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. getStatusLabel for all 8 states
// ---------------------------------------------------------------------------

describe('getStatusLabel', () => {
  const ALL_STATES: AgentTaskStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'paused',
    'expired',
    'recovering',
  ];

  it.each(ALL_STATES)('returns a non-empty label for status=%s', (status) => {
    const label = useAgentTaskStore.getState().getStatusLabel(status);
    expect(label).toBeTruthy();
    expect(typeof label).toBe('string');
  });

  it('returns human-readable labels', () => {
    const { getStatusLabel } = useAgentTaskStore.getState();
    expect(getStatusLabel('pending')).toBe('Pending');
    expect(getStatusLabel('running')).toBe('Running');
    expect(getStatusLabel('completed')).toBe('Completed');
    expect(getStatusLabel('failed')).toBe('Failed');
    expect(getStatusLabel('cancelled')).toBe('Cancelled');
    expect(getStatusLabel('paused')).toBe('Paused');
    expect(getStatusLabel('expired')).toBe('Expired');
    expect(getStatusLabel('recovering')).toBe('Recovering');
  });
});
