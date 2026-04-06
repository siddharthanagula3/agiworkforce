import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAgentTaskStore,
  type AgentTask,
  type AgentTaskLiveStep,
} from '../../stores/agentTaskStore';
import {
  cleanupExecutionListeners,
  initializeExecutionGoalSubscription,
  syncExecutionGoalFromAgentTasks,
  useExecutionStore,
} from '../../stores/executionStore';

function createTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'goal-1',
    goal: 'Ship the release patch',
    status: 'running',
    createdAt: '2026-04-06T14:00:00.000Z',
    ...overrides,
  };
}

function createLiveStep(overrides: Partial<AgentTaskLiveStep> = {}): AgentTaskLiveStep {
  return {
    id: 'step-1',
    index: 0,
    description: 'Collect release notes',
    status: 'running',
    startedAt: new Date('2026-04-06T14:00:10.000Z'),
    ...overrides,
  };
}

describe('executionStore goal sync', () => {
  beforeEach(() => {
    cleanupExecutionListeners();
    useExecutionStore.getState().reset();
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
  });

  afterEach(() => {
    cleanupExecutionListeners();
    vi.useRealTimers();
  });

  it('derives the active goal and step timeline from canonical agent-task state', () => {
    useExecutionStore.setState({
      steps: [
        {
          id: 'step-2',
          goalId: 'goal-1',
          index: 1,
          description: 'Publish the build',
          status: 'in-progress',
          llmReasoning: 'Checking release artifacts',
        },
      ],
    });

    syncExecutionGoalFromAgentTasks({
      tasks: [createTask({ id: 'goal-1', iterations: 1 })],
      liveStepsByTask: {
        'goal-1': [
          createLiveStep({
            id: 'step-1',
            description: 'Collect release notes',
            status: 'done',
            completedAt: new Date('2026-04-06T14:00:20.000Z'),
            executionTimeMs: 750,
          }),
          createLiveStep({
            id: 'step-2',
            index: 1,
            description: 'Publish the build',
            status: 'running',
          }),
        ],
      },
      liveProgressByTask: {
        'goal-1': { step: 1, total: 3 },
      },
    });

    const state = useExecutionStore.getState();

    expect(state.activeGoal).toEqual({
      id: 'goal-1',
      description: 'Ship the release patch',
      status: 'executing',
      startTime: new Date('2026-04-06T14:00:00.000Z').getTime(),
      endTime: undefined,
      totalSteps: 3,
      completedSteps: 1,
      progressPercent: 33,
    });
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0]).toMatchObject({
      id: 'step-1',
      goalId: 'goal-1',
      status: 'completed',
      executionTimeMs: 750,
    });
    expect(state.steps[1]).toMatchObject({
      id: 'step-2',
      goalId: 'goal-1',
      status: 'in-progress',
      llmReasoning: 'Checking release artifacts',
    });
  });

  it('subscribes to agent-task store changes once and mirrors them into execution state', () => {
    initializeExecutionGoalSubscription();

    useAgentTaskStore.setState({
      tasks: [createTask({ id: 'goal-2', goal: 'Prepare migration', status: 'pending' })],
      loading: false,
      liveStepsByTask: {
        'goal-2': [
          createLiveStep({
            id: 'step-a',
            description: 'Draft migration plan',
            status: 'pending',
          }),
        ],
      },
      liveProgressByTask: {
        'goal-2': { step: 0, total: 2 },
      },
    });

    const state = useExecutionStore.getState();

    expect(state.activeGoal).toMatchObject({
      id: 'goal-2',
      description: 'Prepare migration',
      status: 'planning',
      totalSteps: 2,
      completedSteps: 0,
      progressPercent: 0,
    });
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0]).toMatchObject({
      id: 'step-a',
      goalId: 'goal-2',
      status: 'pending',
      description: 'Draft migration plan',
    });
  });

  it('cleans execution contexts after a terminal goal timeout while keeping goal summary visible', () => {
    vi.useFakeTimers();

    syncExecutionGoalFromAgentTasks({
      tasks: [
        createTask({
          id: 'goal-3',
          goal: 'Finalize incident report',
          status: 'completed',
          completedAt: '2026-04-06T14:05:00.000Z',
          iterations: 2,
        }),
      ],
      liveStepsByTask: {
        'goal-3': [
          createLiveStep({
            id: 'step-final',
            description: 'Publish summary',
            status: 'done',
            completedAt: new Date('2026-04-06T14:04:59.000Z'),
          }),
        ],
      },
      liveProgressByTask: {
        'goal-3': { step: 2, total: 2 },
      },
    });

    expect(useExecutionStore.getState().activeGoal?.status).toBe('completed');
    expect(useExecutionStore.getState().steps).toHaveLength(1);

    vi.advanceTimersByTime(5000);

    const state = useExecutionStore.getState();
    expect(state.activeGoal).toMatchObject({
      id: 'goal-3',
      status: 'completed',
      progressPercent: 100,
    });
    expect(state.steps).toHaveLength(0);
    expect(state.terminalLogs).toHaveLength(0);
    expect(state.currentLLMStream).toBe('');
    expect(state.isStreaming).toBe(false);
  });
});
