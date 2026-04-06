import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressIndicator } from '../AGI/ProgressIndicator';
import {
  applyAgentTaskGoalAchieved,
  applyAgentTaskGoalPlanCreated,
  applyAgentTaskGoalProgress,
  applyAgentTaskGoalStepCompleted,
  applyAgentTaskGoalStepStarted,
  applyAgentTaskGoalSubmitted,
  useAgentTaskStore,
} from '../../stores/agentTaskStore';

describe('ProgressIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
    });
  });

  it('renders nothing when there are no active goals', () => {
    const { container } = render(<ProgressIndicator />);
    expect(container.innerHTML).toBe('');
  });

  it('displays a goal in planning state after submission', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Analyze customer data',
      });
    });

    expect(screen.getByText('Planning approach')).toBeInTheDocument();
    expect(screen.getByText('Analyze customer data')).toBeInTheDocument();
  });

  it('transitions to executing state after plan creation', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Process files',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 5,
        estimated_duration_ms: 10000,
      });
    });

    expect(screen.getByText('Executing goal')).toBeInTheDocument();
  });

  it('updates progress percentage from canonical task state', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Run analysis',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 4,
        estimated_duration_ms: 8000,
      });
      applyAgentTaskGoalProgress({
        goal_id: 'goal-1',
        completed_steps: 3,
        total_steps: 4,
        progress_percent: 75,
      });
    });

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows completed status after goal completion', () => {
    render(<ProgressIndicator autoHide={false} />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Deploy app',
      });
      applyAgentTaskGoalAchieved({
        goal_id: 'goal-1',
        total_steps: 2,
        completed_steps: 2,
      });
    });

    expect(screen.getByText('Goal achieved')).toBeInTheDocument();
  });

  it('renders step descriptions after step start events', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Build project',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 3,
        estimated_duration_ms: 6000,
      });
      applyAgentTaskGoalStepStarted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 3,
        description: 'Install dependencies',
      });
    });

    expect(screen.getByText('Install dependencies')).toBeInTheDocument();
  });

  it('shows execution time on completed steps', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Test steps',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 2,
        estimated_duration_ms: 4000,
      });
      applyAgentTaskGoalStepStarted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 2,
        description: 'Compile code',
      });
      applyAgentTaskGoalStepCompleted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 2,
        success: true,
        execution_time_ms: 1234,
      });
    });

    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  it('shows error text on failed steps', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Failing task',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 1,
        estimated_duration_ms: 2000,
      });
      applyAgentTaskGoalStepStarted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 1,
        description: 'Connect to database',
      });
      applyAgentTaskGoalStepCompleted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 1,
        success: false,
        execution_time_ms: 500,
        error: 'Connection refused',
      });
    });

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('toggles goal expansion when the button is clicked', () => {
    render(<ProgressIndicator />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Expandable goal',
      });
      applyAgentTaskGoalPlanCreated({
        goal_id: 'goal-1',
        total_steps: 1,
        estimated_duration_ms: 1000,
      });
      applyAgentTaskGoalStepStarted({
        goal_id: 'goal-1',
        step_id: 'step-0',
        step_index: 0,
        total_steps: 1,
        description: 'Step visible when expanded',
      });
    });

    expect(screen.getByText('Step visible when expanded')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse'));
    expect(screen.queryByText('Step visible when expanded')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand'));
    expect(screen.getByText('Step visible when expanded')).toBeInTheDocument();
  });

  it('renders compact mode with a status line', () => {
    render(<ProgressIndicator compact />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Compact goal',
      });
    });

    expect(screen.getByText('Planning approach')).toBeInTheDocument();
  });

  it('shows dismiss after goal completion and hides on click', () => {
    render(<ProgressIndicator autoHide={false} />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Dismissable goal',
      });
      applyAgentTaskGoalAchieved({
        goal_id: 'goal-1',
        total_steps: 1,
        completed_steps: 1,
      });
    });

    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Dismissable goal')).not.toBeInTheDocument();
  });

  it('auto-hides completed goals after the configured delay', () => {
    render(<ProgressIndicator autoHide autoHideDelay={3000} />);

    act(() => {
      applyAgentTaskGoalSubmitted({
        goal_id: 'goal-1',
        description: 'Auto hide goal',
      });
      applyAgentTaskGoalAchieved({
        goal_id: 'goal-1',
        total_steps: 1,
        completed_steps: 1,
      });
    });

    expect(screen.getByText('Auto hide goal')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Auto hide goal')).not.toBeInTheDocument();
  });
});
