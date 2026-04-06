import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyIterationGoalUnachievable,
  applyIterationPlanCritique,
  applyIterationPlanRevised,
  applyIterationProgressComplete,
  applyIterationProgressStart,
  useExecutionStore,
} from '../../stores/executionStore';

describe('executionStore iteration progress reducers', () => {
  beforeEach(() => {
    useExecutionStore.getState().reset();
  });

  it('tracks iteration start and plan critique state from canonical events', () => {
    applyIterationProgressStart({
      goal_id: 'goal-1',
      iteration: 2,
      has_prior_reflection: true,
    });
    applyIterationPlanCritique({
      goal_id: 'goal-1',
      iteration: 2,
      quality_score: 42,
      likely_to_succeed: false,
      risks_count: 3,
      suggestions: ['Reduce scope', 'Add a prerequisite step'],
    });

    const state = useExecutionStore.getState().iterationProgress;

    expect(state).toMatchObject({
      goalId: 'goal-1',
      status: 'planning',
      currentIteration: 2,
      hasPriorReflection: true,
      consecutiveFailures: 0,
      planCritique: {
        iteration: 2,
        qualityScore: 42,
        likelyToSucceed: false,
        risksCount: 3,
        suggestions: ['Reduce scope', 'Add a prerequisite step'],
      },
    });
    expect(state.startTime).toBeTypeOf('number');
  });

  it('records iteration completion history and preserves ordering by iteration', () => {
    applyIterationProgressStart({
      goal_id: 'goal-2',
      iteration: 1,
    });
    applyIterationProgressComplete({
      goal_id: 'goal-2',
      iteration: 2,
      steps_succeeded: 1,
      steps_failed: 1,
      consecutive_failures: 1,
    });
    applyIterationProgressComplete({
      goal_id: 'goal-2',
      iteration: 1,
      steps_succeeded: 3,
      steps_failed: 0,
      consecutive_failures: 0,
    });

    const state = useExecutionStore.getState().iterationProgress;

    expect(state.status).toBe('reflecting');
    expect(state.currentIteration).toBe(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.history).toEqual([
      {
        iteration: 1,
        stepsSucceeded: 3,
        stepsFailed: 0,
        consecutiveFailures: 0,
        timestamp: expect.any(Number),
      },
      {
        iteration: 2,
        stepsSucceeded: 1,
        stepsFailed: 1,
        consecutiveFailures: 1,
        timestamp: expect.any(Number),
      },
    ]);
  });

  it('marks a goal failed when the loop reports it as unachievable', () => {
    applyIterationProgressStart({
      goal_id: 'goal-3',
      iteration: 3,
    });
    applyIterationPlanRevised({
      goal_id: 'goal-3',
      iteration: 3,
      corrections_applied: 2,
    });
    applyIterationGoalUnachievable({
      goal_id: 'goal-3',
      iterations: 3,
      consecutive_failures: 3,
      final_insight: {
        id: 'insight-1',
        goalId: 'goal-3',
        assessment: {
          successRate: 0.2,
          successfulSteps: [],
          failedSteps: [],
          goalAchievable: false,
          progressEstimate: 0.1,
          resourceEfficiency: 0.4,
          timeEfficiency: 0.3,
        },
        failurePatterns: [],
        corrections: [],
        subGoals: [],
        recommendations: ['Escalate to a human'],
        confidence: 0.91,
        timestamp: Date.now(),
      },
    });

    const state = useExecutionStore.getState().iterationProgress;

    expect(state).toMatchObject({
      goalId: 'goal-3',
      status: 'failed',
      currentIteration: 3,
      consecutiveFailures: 3,
    });
  });
});
