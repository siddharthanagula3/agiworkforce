import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  applyAgentTaskStateChanged,
  type AgentTask,
  type AgentTaskStatus,
  useAgentTaskStore,
} from '../stores/agentTaskStore';
import { invoke } from '../lib/tauri-mock';

const mockInvoke = vi.mocked(invoke);

function seedTask(status: AgentTaskStatus = 'queued'): AgentTask {
  const task: AgentTask = {
    id: 'goal-lifecycle',
    goal: 'Verify the release',
    status,
    createdAt: new Date().toISOString(),
  };
  useAgentTaskStore.setState({ tasks: [task] });
  return task;
}

describe('canonical agent task lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
  });

  it('applies engine states without duplicating the task', () => {
    seedTask();

    for (const state of ['running', 'awaiting_input', 'ready_for_review'] as const) {
      applyAgentTaskStateChanged({
        taskId: 'goal-lifecycle',
        previousState: useAgentTaskStore.getState().tasks[0]?.status,
        state,
      });
    }

    const tasks = useAgentTaskStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual(
      expect.objectContaining({
        id: 'goal-lifecycle',
        status: 'ready_for_review',
        completedAt: expect.any(String),
      }),
    );
  });

  it('creates an event-first task when the state event wins the submission race', () => {
    applyAgentTaskStateChanged({ taskId: 'goal-event-first', state: 'queued' });

    expect(useAgentTaskStore.getState().tasks).toEqual([
      expect.objectContaining({ id: 'goal-event-first', status: 'queued' }),
    ]);
  });

  it('pauses through the native engine and refreshes from its state', async () => {
    seedTask('running');
    mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      state: 'paused',
      currentIteration: 2,
      context: { toolResults: [] },
    });

    await useAgentTaskStore.getState().pauseTask('goal-lifecycle', 'Waiting for review');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'agi_pause_goal', {
      goalId: 'goal-lifecycle',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'agi_get_goal_status', {
      goalId: 'goal-lifecycle',
    });
    expect(useAgentTaskStore.getState().tasks[0]).toEqual(
      expect.objectContaining({
        status: 'paused',
        pauseReason: 'Waiting for review',
        iterations: 2,
      }),
    );
  });

  it('resumes through the native engine and refreshes from its state', async () => {
    seedTask('paused');
    mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      state: 'running',
      currentIteration: 3,
      context: { toolResults: [] },
    });

    await useAgentTaskStore.getState().resumeTask('goal-lifecycle');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'agi_resume_goal', {
      goalId: 'goal-lifecycle',
    });
    expect(useAgentTaskStore.getState().tasks[0]).toEqual(
      expect.objectContaining({ status: 'running', iterations: 3 }),
    );
  });

  it.each([
    ['queued', 'Queued'],
    ['running', 'Running'],
    ['awaiting_input', 'Awaiting input'],
    ['ready_for_review', 'Ready for review'],
    ['completed', 'Completed'],
    ['failed', 'Failed'],
    ['cancelled', 'Cancelled'],
    ['paused', 'Paused'],
    ['archived', 'Archived'],
  ] as const)('labels %s as %s', (status, expected) => {
    expect(useAgentTaskStore.getState().getStatusLabel(status)).toBe(expected);
  });
});
