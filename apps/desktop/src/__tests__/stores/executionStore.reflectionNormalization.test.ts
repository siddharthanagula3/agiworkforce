import { describe, expect, it } from 'vitest';
import { normalizeReflectionInsight } from '../../stores/executionStore';

describe('executionStore reflection normalization', () => {
  it('normalizes snake_case reflection payloads into the camelCase store contract', () => {
    const insight = normalizeReflectionInsight({
      id: 'insight-1',
      goal_id: 'goal-1',
      assessment: {
        success_rate: 0.5,
        successful_steps: ['step-1'],
        failed_steps: [
          {
            step_id: 'step-2',
            tool_id: 'shell',
            description: 'Run migration',
            error: 'permission denied',
            failure_category: 'PermissionDenied',
            recoverable: true,
          },
        ],
        goal_achievable: false,
        progress_estimate: 0.6,
        resource_efficiency: 0.7,
        time_efficiency: 0.8,
      },
      failure_patterns: [
        {
          pattern_id: 'pattern-1',
          category: 'PermissionDenied',
          description: 'Missing write access',
          affected_steps: ['step-2'],
          root_cause: 'Sandbox policy',
          frequency: 2,
        },
      ],
      corrections: [
        {
          for_step_id: 'step-2',
          correction_type: 'RequiresHuman',
          description: 'Request elevated access',
          alternative_tool: 'approval_request',
          modified_parameters: { mode: 'elevated' },
          priority: 1,
        },
      ],
      sub_goals: [
        {
          id: 'subgoal-1',
          parent_goal_id: 'goal-1',
          from_step_id: 'step-2',
          description: 'Obtain access',
          success_criteria: ['Access granted'],
          suggested_tools: ['approval_request'],
          priority: 1,
        },
      ],
      recommendations: ['Ask the user for approval'],
      confidence: 0.94,
      timestamp: 123456,
    });

    expect(insight).toEqual({
      id: 'insight-1',
      goalId: 'goal-1',
      assessment: {
        successRate: 0.5,
        successfulSteps: ['step-1'],
        failedSteps: [
          {
            stepId: 'step-2',
            toolId: 'shell',
            description: 'Run migration',
            error: 'permission denied',
            failureCategory: 'PermissionDenied',
            recoverable: true,
          },
        ],
        goalAchievable: false,
        progressEstimate: 0.6,
        resourceEfficiency: 0.7,
        timeEfficiency: 0.8,
      },
      failurePatterns: [
        {
          patternId: 'pattern-1',
          category: 'PermissionDenied',
          description: 'Missing write access',
          affectedSteps: ['step-2'],
          rootCause: 'Sandbox policy',
          frequency: 2,
        },
      ],
      corrections: [
        {
          forStepId: 'step-2',
          correctionType: 'RequiresHuman',
          description: 'Request elevated access',
          alternativeTool: 'approval_request',
          modifiedParameters: { mode: 'elevated' },
          priority: 1,
        },
      ],
      subGoals: [
        {
          id: 'subgoal-1',
          parentGoalId: 'goal-1',
          fromStepId: 'step-2',
          description: 'Obtain access',
          successCriteria: ['Access granted'],
          suggestedTools: ['approval_request'],
          priority: 1,
        },
      ],
      recommendations: ['Ask the user for approval'],
      confidence: 0.94,
      timestamp: 123456,
    });
  });
});
