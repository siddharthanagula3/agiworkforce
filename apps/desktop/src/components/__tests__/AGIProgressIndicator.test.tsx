import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { listen } from '@tauri-apps/api/event';
import { ProgressIndicator } from '../AGI/ProgressIndicator';

/**
 * The ProgressIndicator component listens to Tauri events and
 * accumulates internal state. We drive its state by capturing the
 * event handlers registered via `listen` and invoking them directly.
 */

type EventHandler = (event: { payload: any }) => void;

let eventHandlers: Record<string, EventHandler>;

beforeEach(() => {
  vi.clearAllMocks();
  eventHandlers = {};

  // Capture event handlers so we can fire them in tests
  vi.mocked(listen).mockImplementation((eventName: string, handler: any) => {
    eventHandlers[eventName] = handler;
    return Promise.resolve(() => {});
  });
});

function emitEvent(eventName: string, payload: any) {
  const handler = eventHandlers[eventName];
  if (handler) {
    act(() => {
      handler({ payload });
    });
  }
}

describe('ProgressIndicator', () => {
  it('should render nothing when there are no active goals', () => {
    const { container } = render(<ProgressIndicator />);

    // Component returns null when no visible goals
    expect(container.innerHTML).toBe('');
  });

  it('should display a goal in planning state after goal:submitted event', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Analyze customer data',
    });

    expect(screen.getByText('Planning approach')).toBeInTheDocument();
    expect(screen.getByText('Analyze customer data')).toBeInTheDocument();
  });

  it('should transition to executing state after plan_created event', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Process files',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 5,
      estimated_duration_ms: 10000,
    });

    expect(screen.getByText('Executing goal')).toBeInTheDocument();
  });

  it('should update progress percentage on progress events', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Run analysis',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 4,
      estimated_duration_ms: 8000,
    });

    emitEvent('agi:goal:progress', {
      goal_id: 'goal-1',
      completed_steps: 3,
      total_steps: 4,
      progress_percent: 75,
    });

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('should show completed status after goal:achieved event', () => {
    // Disable autoHide so it stays visible
    render(<ProgressIndicator autoHide={false} />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Deploy app',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 2,
      estimated_duration_ms: 5000,
    });

    emitEvent('agi:goal:achieved', {
      goal_id: 'goal-1',
      total_steps: 2,
      completed_steps: 2,
    });

    expect(screen.getByText('Goal achieved')).toBeInTheDocument();
  });

  it('should render step descriptions after step_started events', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Build project',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 3,
      estimated_duration_ms: 6000,
    });

    emitEvent('agi:goal:step_started', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 3,
      description: 'Install dependencies',
    });

    // The goal card is expanded by default after submission
    expect(screen.getByText('Install dependencies')).toBeInTheDocument();
  });

  it('should show execution time on completed steps', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Test steps',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 2,
      estimated_duration_ms: 4000,
    });

    emitEvent('agi:goal:step_started', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 2,
      description: 'Compile code',
    });

    emitEvent('agi:goal:step_completed', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 2,
      success: true,
      execution_time_ms: 1234,
    });

    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  it('should show error text on failed steps', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Failing task',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 1,
      estimated_duration_ms: 2000,
    });

    emitEvent('agi:goal:step_started', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 1,
      description: 'Connect to database',
    });

    emitEvent('agi:goal:step_completed', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 1,
      success: false,
      execution_time_ms: 500,
      error: 'Connection refused',
    });

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('should toggle goal expansion when collapse/expand button is clicked', () => {
    render(<ProgressIndicator />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Expandable goal',
    });

    emitEvent('agi:goal:plan_created', {
      goal_id: 'goal-1',
      total_steps: 1,
      estimated_duration_ms: 1000,
    });

    emitEvent('agi:goal:step_started', {
      goal_id: 'goal-1',
      step_id: 'step-0',
      step_index: 0,
      total_steps: 1,
      description: 'Step visible when expanded',
    });

    // The goal should be expanded by default (submitted events auto-expand)
    expect(screen.getByText('Step visible when expanded')).toBeInTheDocument();

    // Click the collapse button
    const collapseBtn = screen.getByLabelText('Collapse');
    fireEvent.click(collapseBtn);

    // Steps should no longer be visible
    expect(screen.queryByText('Step visible when expanded')).not.toBeInTheDocument();

    // Click expand again
    const expandBtn = screen.getByLabelText('Expand');
    fireEvent.click(expandBtn);

    expect(screen.getByText('Step visible when expanded')).toBeInTheDocument();
  });

  it('should render compact mode with just a status line', () => {
    render(<ProgressIndicator compact />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Compact goal',
    });

    // In compact mode, it should show the status label text
    expect(screen.getByText('Planning approach')).toBeInTheDocument();
  });

  it('should show the Dismiss button after goal completion', () => {
    render(<ProgressIndicator autoHide={false} />);

    emitEvent('agi:goal:submitted', {
      goal_id: 'goal-1',
      description: 'Dismissable goal',
    });

    emitEvent('agi:goal:achieved', {
      goal_id: 'goal-1',
      total_steps: 1,
      completed_steps: 1,
    });

    expect(screen.getByText('Dismiss')).toBeInTheDocument();

    // Clicking dismiss hides the goal
    fireEvent.click(screen.getByText('Dismiss'));

    // After dismiss, the goal card should be gone
    expect(screen.queryByText('Dismissable goal')).not.toBeInTheDocument();
  });
});
