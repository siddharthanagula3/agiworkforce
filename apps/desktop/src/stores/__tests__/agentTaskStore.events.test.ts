import { beforeEach, describe, expect, it } from 'vitest';
import {
  useAgentTaskStore,
  applyAgentTaskGoalAchieved,
  applyAgentTaskGoalError,
  applyAgentTaskGoalPlanCreated,
  applyAgentTaskGoalProgress,
  applyAgentTaskGoalStepCompleted,
  applyAgentTaskGoalStepStarted,
  applyAgentTaskGoalSubmitted,
} from '../agentTaskStore';

describe('agentTaskStore goal event reducers', () => {
  beforeEach(() => {
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
  });

  it('creates and advances a task from AGI goal events', () => {
    applyAgentTaskGoalSubmitted({
      goal_id: 'goal-1',
      description: 'Write release notes',
    });
    applyAgentTaskGoalPlanCreated({
      goal_id: 'goal-1',
      total_steps: 3,
      estimated_duration_ms: 5000,
    });
    applyAgentTaskGoalStepStarted({
      goal_id: 'goal-1',
      step_id: 'step-1',
      step_index: 0,
      total_steps: 3,
      description: 'Collect changes',
    });
    applyAgentTaskGoalProgress({
      goal_id: 'goal-1',
      completed_steps: 1,
      total_steps: 3,
      progress_percent: 33,
    });
    applyAgentTaskGoalStepCompleted({
      goal_id: 'goal-1',
      step_id: 'step-1',
      step_index: 0,
      total_steps: 3,
      success: true,
      execution_time_ms: 1200,
    });

    const state = useAgentTaskStore.getState();
    const task = state.tasks.find((entry) => entry.id === 'goal-1');
    const liveStep = state.liveStepsByTask['goal-1']?.[0];

    expect(task?.goal).toBe('Write release notes');
    expect(task?.status).toBe('running');
    expect(task?.iterations).toBe(1);
    expect(state.liveProgressByTask['goal-1']).toEqual({ step: 1, total: 3 });
    expect(liveStep?.description).toBe('Collect changes');
    expect(liveStep?.status).toBe('done');
    expect(liveStep?.completedAt).toBeInstanceOf(Date);
  });

  it('marks a task completed and closes any running live steps', () => {
    applyAgentTaskGoalSubmitted({
      goal_id: 'goal-2',
      description: 'Ship patch',
    });
    applyAgentTaskGoalStepStarted({
      goal_id: 'goal-2',
      step_id: 'step-2',
      step_index: 1,
      total_steps: 2,
      description: 'Publish release',
    });
    applyAgentTaskGoalAchieved({
      goal_id: 'goal-2',
      total_steps: 2,
      completed_steps: 2,
    });

    const state = useAgentTaskStore.getState();
    const task = state.tasks.find((entry) => entry.id === 'goal-2');
    const liveStep = state.liveStepsByTask['goal-2']?.[0];

    expect(task?.status).toBe('completed');
    expect(task?.completedAt).toBeDefined();
    expect(task?.iterations).toBe(2);
    expect(state.liveProgressByTask['goal-2']).toEqual({ step: 2, total: 2 });
    expect(liveStep?.status).toBe('done');
  });

  it('marks a task failed and closes running live steps as failed', () => {
    applyAgentTaskGoalSubmitted({
      goal_id: 'goal-3',
      description: 'Run migration',
    });
    applyAgentTaskGoalStepStarted({
      goal_id: 'goal-3',
      step_id: 'step-3',
      step_index: 0,
      total_steps: 1,
      description: 'Apply SQL',
    });
    applyAgentTaskGoalError({
      goal_id: 'goal-3',
      error: 'Migration failed',
    });

    const state = useAgentTaskStore.getState();
    const task = state.tasks.find((entry) => entry.id === 'goal-3');
    const liveStep = state.liveStepsByTask['goal-3']?.[0];

    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('Migration failed');
    expect(task?.completedAt).toBeDefined();
    expect(liveStep?.status).toBe('failed');
    expect(liveStep?.completedAt).toBeInstanceOf(Date);
  });

  it('caps retained live task progress for long-running demo sessions', () => {
    for (let index = 0; index < 105; index++) {
      const goalId = `goal-${index}`;
      applyAgentTaskGoalPlanCreated({
        goal_id: goalId,
        total_steps: 1,
        estimated_duration_ms: 1000,
      });
      applyAgentTaskGoalStepStarted({
        goal_id: goalId,
        step_id: `step-${index}`,
        step_index: 0,
        total_steps: 1,
        description: `Step ${index}`,
      });
    }

    const state = useAgentTaskStore.getState();
    expect(Object.keys(state.liveProgressByTask)).toHaveLength(100);
    expect(Object.keys(state.liveStepsByTask)).toHaveLength(100);
    expect(state.liveProgressByTask['goal-0']).toBeUndefined();
    expect(state.liveStepsByTask['goal-104']).toBeDefined();
  });
});
