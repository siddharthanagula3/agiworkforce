import { beforeEach, describe, expect, it } from 'vitest';
import {
  useAgentTaskStore,
  applyAgentTaskGoalAchieved,
  applyAgentTaskGoalError,
  applyAgentTaskGoalPlanCreated,
  applyAgentTaskGoalProgress,
  applyAgentTaskGoalExecutionCompleted,
  applyAgentTaskGoalExecutionStarted,
  applyAgentTaskGoalStepCompleted,
  applyAgentTaskGoalStepStarted,
  applyAgentTaskGoalSubmitted,
  applyAgentTaskStateChanged,
  applyAgentTaskSwarmCompleted,
  applySwarmDecomposed,
  applySwarmSubtaskCompleted,
  applySwarmSubtaskFailed,
  applySwarmSubtaskStarted,
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
    applyAgentTaskStateChanged({
      taskId: 'goal-1',
      state: 'running',
      previousState: 'queued',
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

  it('accepts the engine review state and closes any running live steps', () => {
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
    applyAgentTaskStateChanged({
      taskId: 'goal-2',
      state: 'ready_for_review',
      previousState: 'running',
    });

    const state = useAgentTaskStore.getState();
    const task = state.tasks.find((entry) => entry.id === 'goal-2');
    const liveStep = state.liveStepsByTask['goal-2']?.[0];

    expect(task?.status).toBe('ready_for_review');
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
    applyAgentTaskStateChanged({
      taskId: 'goal-3',
      state: 'failed',
      previousState: 'running',
      summary: 'Migration failed',
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

  it('reflects native parallel execution from engine start through completion', () => {
    applyAgentTaskGoalExecutionStarted(
      {
        goal_id: 'goal-parallel',
        description: 'Analyze all files',
      },
      'parallel',
    );

    expect(useAgentTaskStore.getState().tasks).toEqual([
      expect.objectContaining({
        id: 'goal-parallel',
        status: 'queued',
        executionMode: 'parallel',
      }),
    ]);

    applyAgentTaskStateChanged({
      taskId: 'goal-parallel',
      state: 'running',
      previousState: 'queued',
    });

    applyAgentTaskGoalExecutionCompleted({
      goal_id: 'goal-parallel',
      success: true,
    });
    applyAgentTaskStateChanged({
      taskId: 'goal-parallel',
      state: 'ready_for_review',
      previousState: 'running',
    });

    expect(useAgentTaskStore.getState().tasks).toEqual([
      expect.objectContaining({
        id: 'goal-parallel',
        status: 'ready_for_review',
        completedAt: expect.any(String),
      }),
    ]);
  });

  it('does not let a late start event downgrade an engine-terminal task', () => {
    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'goal-terminal',
          goal: 'Finished goal',
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    });

    applyAgentTaskGoalExecutionStarted(
      { goal_id: 'goal-terminal', description: 'Finished goal' },
      'swarm',
    );

    expect(useAgentTaskStore.getState().tasks[0]?.status).toBe('completed');
  });

  it('shows swarm subtasks as live steps of the task that spawned them', () => {
    applySwarmDecomposed({ goal_id: 'goal-swarm', total_subtasks: 3 });
    applySwarmSubtaskStarted({
      goal_id: 'goal-swarm',
      subtask_id: 'subtask-a',
      description: 'Read the changelog',
    });
    applySwarmSubtaskStarted({
      goal_id: 'goal-swarm',
      subtask_id: 'subtask-b',
      description: 'Read the release notes',
    });
    applySwarmSubtaskCompleted({
      goal_id: 'goal-swarm',
      subtask_id: 'subtask-a',
      execution_time_ms: 420,
    });
    applySwarmSubtaskFailed({
      goal_id: 'goal-swarm',
      subtask_id: 'subtask-b',
      error: 'The page did not load',
    });

    const state = useAgentTaskStore.getState();
    expect(state.liveStepsByTask['goal-swarm']).toEqual([
      expect.objectContaining({
        id: 'subtask-a',
        index: 0,
        description: 'Read the changelog',
        status: 'done',
        executionTimeMs: 420,
      }),
      expect.objectContaining({
        id: 'subtask-b',
        index: 1,
        description: 'Read the release notes',
        status: 'failed',
        error: 'The page did not load',
      }),
    ]);
    expect(state.liveProgressByTask['goal-swarm']).toEqual({ step: 2, total: 3 });
  });

  it('records the swarm result when the run reports completion', () => {
    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'goal-swarm',
          goal: 'Audit the release',
          status: 'running',
          createdAt: new Date().toISOString(),
          executionMode: 'swarm',
        },
      ],
    });

    applyAgentTaskSwarmCompleted({
      goal_id: 'goal-swarm',
      success: true,
      succeeded: 3,
      failed: 1,
      wall_time_ms: 1200,
      speedup_ratio: 1.8,
      critical_path_length: 2,
      max_parallelism: 3,
      summary: '3 of 4 subtasks finished',
    });

    expect(useAgentTaskStore.getState().tasks[0]).toEqual(
      expect.objectContaining({
        status: 'running',
        result: '3 of 4 subtasks finished',
        swarmMetrics: expect.objectContaining({ succeeded: 3, failed: 1, wallTimeMs: 1200 }),
      }),
    );
  });

  it('leaves a scheduled run to the Scheduled tasks list, which owns its Stop', () => {
    const runId = 'scheduled_5b0f8a54-2f0e-4a53-9b37-6c2f0a1f1c11';

    applyAgentTaskStateChanged({ taskId: runId, state: 'queued' });
    applyAgentTaskGoalSubmitted({ goal_id: runId, description: 'Summarise my inbox' });
    applyAgentTaskGoalPlanCreated({ goal_id: runId, total_steps: 1, estimated_duration_ms: 1 });
    applyAgentTaskGoalStepStarted({
      goal_id: runId,
      step_id: 'step-1',
      step_index: 0,
      total_steps: 1,
      description: 'Think it through',
    });
    applyAgentTaskGoalProgress({
      goal_id: runId,
      completed_steps: 1,
      total_steps: 1,
      progress_percent: 100,
    });
    applyAgentTaskGoalAchieved({ goal_id: runId, total_steps: 1, completed_steps: 1 });
    applyAgentTaskGoalError({ goal_id: runId, error: 'ignored' });
    applyAgentTaskStateChanged({ taskId: runId, state: 'ready_for_review' });

    const state = useAgentTaskStore.getState();
    expect(state.tasks).toEqual([]);
    expect(Object.keys(state.liveStepsByTask)).toEqual([]);
    expect(Object.keys(state.liveProgressByTask)).toEqual([]);
  });

  it('keeps a swarm sub-goal off the task list and shows it on the parent row only', () => {
    const subGoalId = 'swarm-subgoal-goal-swarm--subtask_1';
    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'goal-swarm',
          goal: 'Audit the release',
          status: 'running',
          createdAt: new Date().toISOString(),
          executionMode: 'swarm',
        },
      ],
    });

    applySwarmSubtaskStarted({
      goal_id: 'goal-swarm',
      subtask_id: 'subtask_1',
      description: 'Read the changelog',
    });
    applyAgentTaskStateChanged({ taskId: subGoalId, state: 'queued' });
    applyAgentTaskGoalSubmitted({ goal_id: subGoalId, description: 'Read the changelog' });
    applyAgentTaskStateChanged({ taskId: subGoalId, state: 'running', previousState: 'queued' });
    applyAgentTaskGoalPlanCreated({ goal_id: subGoalId, total_steps: 2, estimated_duration_ms: 1 });
    applyAgentTaskGoalStepStarted({
      goal_id: subGoalId,
      step_id: 'step-1',
      step_index: 0,
      total_steps: 2,
      description: 'Open the file',
    });
    applyAgentTaskGoalStepCompleted({
      goal_id: subGoalId,
      step_id: 'step-1',
      step_index: 0,
      total_steps: 2,
      success: true,
      execution_time_ms: 5,
    });
    applyAgentTaskGoalProgress({
      goal_id: subGoalId,
      completed_steps: 1,
      total_steps: 2,
      progress_percent: 50,
    });
    applyAgentTaskGoalAchieved({ goal_id: subGoalId, total_steps: 2, completed_steps: 2 });
    applyAgentTaskGoalError({ goal_id: subGoalId, error: 'ignored' });
    applyAgentTaskGoalExecutionStarted({ goal_id: subGoalId, description: 'nested' }, 'parallel');
    applyAgentTaskGoalExecutionCompleted({ goal_id: subGoalId, success: true });
    applyAgentTaskStateChanged({ taskId: subGoalId, state: 'ready_for_review' });

    const state = useAgentTaskStore.getState();
    expect(state.tasks.map((task) => task.id)).toEqual(['goal-swarm']);
    expect(state.tasks[0]).toEqual(expect.objectContaining({ status: 'running' }));
    expect(Object.keys(state.liveStepsByTask)).toEqual(['goal-swarm']);
    expect(Object.keys(state.liveProgressByTask)).toEqual([]);
    expect(state.liveStepsByTask['goal-swarm']).toEqual([
      expect.objectContaining({ id: 'subtask_1', description: 'Read the changelog' }),
    ]);
  });

  it('still lists a task the user started whose id merely contains the sub-goal marker', () => {
    applyAgentTaskStateChanged({ taskId: 'goal-about-swarm-subgoal-ids', state: 'queued' });

    expect(useAgentTaskStore.getState().tasks.map((task) => task.id)).toEqual([
      'goal-about-swarm-subgoal-ids',
    ]);
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
