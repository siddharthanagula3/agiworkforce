import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolExecutionTimeline } from '../ToolCalling/ToolExecutionTimeline';
import type { ToolExecutionWorkflow, ToolExecutionStep, ToolCallUI } from '../../types/toolCalling';

// Mock child components that have complex dependencies (JsonViewer, Prism, etc.)
vi.mock('../ToolCalling/ToolCallCard', () => ({
  ToolCallCard: ({
    toolCall,
    onCancel,
    onApprove,
    onReject,
  }: {
    toolCall: ToolCallUI;
    onCancel?: (id: string) => void;
    onApprove?: (id: string) => void;
    onReject?: (id: string) => void;
    defaultExpanded?: boolean;
  }) => (
    <div data-testid={`tool-call-${toolCall.id}`}>
      <span data-testid="tool-name">{toolCall.tool_name}</span>
      <span data-testid="tool-status">{toolCall.status}</span>
      {onCancel && (
        <button data-testid={`cancel-${toolCall.id}`} onClick={() => onCancel(toolCall.id)}>
          Cancel
        </button>
      )}
      {onApprove && (
        <button data-testid={`approve-${toolCall.id}`} onClick={() => onApprove(toolCall.id)}>
          Approve
        </button>
      )}
      {onReject && (
        <button data-testid={`reject-${toolCall.id}`} onClick={() => onReject(toolCall.id)}>
          Reject
        </button>
      )}
    </div>
  ),
}));

vi.mock('../ToolCalling/ToolResultCard', () => ({
  ToolResultCard: ({ result }: { result: { success: boolean; data: unknown; error?: string } }) => (
    <div data-testid="tool-result">
      <span data-testid="result-success">{result.success ? 'success' : 'failure'}</span>
      {result.error && <span data-testid="result-error">{result.error}</span>}
    </div>
  ),
}));

vi.mock('../ToolCalling/ToolErrorDisplay', () => ({
  ToolErrorDisplay: ({
    error,
    toolName,
    onRetry,
  }: {
    error: string;
    toolName: string;
    onRetry?: () => void;
    parameters?: Record<string, unknown>;
    retryable?: boolean;
  }) => (
    <div data-testid="tool-error">
      <span data-testid="error-message">{error}</span>
      <span data-testid="error-tool">{toolName}</span>
      {onRetry && (
        <button data-testid="retry-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  ),
}));

function makeToolCall(overrides: Partial<ToolCallUI> = {}): ToolCallUI {
  return {
    id: 'tc-1',
    tool_id: 'tool-file-read',
    tool_name: 'File Read',
    tool_description: 'Read file contents',
    parameters: { path: '/tmp/test.txt' },
    status: 'completed',
    created_at: '2026-02-24T00:00:00Z',
    started_at: '2026-02-24T00:00:01Z',
    completed_at: '2026-02-24T00:00:02Z',
    duration_ms: 1000,
    ...overrides,
  };
}

function makeStep(
  overrides: Partial<ToolExecutionStep> & { tool_call?: Partial<ToolCallUI> } = {},
): ToolExecutionStep {
  const { tool_call: toolCallOverrides, ...stepOverrides } = overrides;
  return {
    step_number: 1,
    tool_call: makeToolCall(toolCallOverrides),
    ...stepOverrides,
  };
}

function makeWorkflow(overrides: Partial<ToolExecutionWorkflow> = {}): ToolExecutionWorkflow {
  return {
    id: 'wf-1',
    description: 'Test Workflow',
    steps: [],
    status: 'pending',
    created_at: '2026-02-24T00:00:00Z',
    ...overrides,
  };
}

describe('ToolExecutionTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the workflow description', () => {
    const workflow = makeWorkflow({ description: 'Analyze user data' });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByText('Analyze user data')).toBeInTheDocument();
  });

  it('should show empty state when there are no steps', () => {
    const workflow = makeWorkflow({ steps: [] });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByText('No execution steps yet')).toBeInTheDocument();
  });

  it('should render workflow status labels correctly', () => {
    const statuses = [
      { status: 'pending' as const, label: 'Pending' },
      { status: 'in_progress' as const, label: 'In Progress' },
      { status: 'completed' as const, label: 'Completed' },
      { status: 'failed' as const, label: 'Failed' },
      { status: 'cancelled' as const, label: 'Cancelled' },
    ];

    for (const { status, label } of statuses) {
      const workflow = makeWorkflow({ status });
      const { unmount } = render(<ToolExecutionTimeline workflow={workflow} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('should render tool call steps', () => {
    const steps: ToolExecutionStep[] = [
      makeStep({
        step_number: 1,
        tool_call: {
          id: 'tc-1',
          tool_id: 'tool-1',
          tool_name: 'File Read',
          tool_description: '',
          parameters: {},
          status: 'completed',
          created_at: '2026-02-24T10:00:00Z',
        },
      }),
      makeStep({
        step_number: 2,
        tool_call: {
          id: 'tc-2',
          tool_id: 'tool-2',
          tool_name: 'Code Execute',
          tool_description: '',
          parameters: {},
          status: 'in_progress',
          created_at: '2026-02-24T10:00:00Z',
        },
      }),
    ];

    const workflow = makeWorkflow({
      steps,
      status: 'in_progress',
      current_step: 1,
      total_steps: 2,
    });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByTestId('tool-call-tc-1')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-tc-2')).toBeInTheDocument();
    // Both tool names should be visible via testids
    expect(
      screen.getByTestId('tool-call-tc-1').querySelector('[data-testid="tool-name"]'),
    ).toHaveTextContent('File Read');
    expect(
      screen.getByTestId('tool-call-tc-2').querySelector('[data-testid="tool-name"]'),
    ).toHaveTextContent('Code Execute');
  });

  it('should show progress bar when workflow is in progress', () => {
    const workflow = makeWorkflow({
      status: 'in_progress',
      current_step: 2,
      total_steps: 4,
      steps: [
        makeStep({
          step_number: 1,
          tool_call: {
            id: 'tc-1',
            tool_id: 'tool-1',
            tool_name: 'Test',
            tool_description: '',
            parameters: {},
            status: 'completed',
            created_at: '2026-02-24T10:00:00Z',
          },
        }),
        makeStep({
          step_number: 2,
          tool_call: {
            id: 'tc-2',
            tool_id: 'tool-2',
            tool_name: 'Test',
            tool_description: '',
            parameters: {},
            status: 'in_progress',
            created_at: '2026-02-24T10:00:00Z',
          },
        }),
      ],
    });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should render tool result for completed steps', () => {
    const steps: ToolExecutionStep[] = [
      makeStep({
        step_number: 1,
        tool_call: {
          id: 'tc-1',
          tool_id: 'tool-1',
          tool_name: 'File Read',
          tool_description: '',
          parameters: {},
          status: 'completed',
          created_at: '2026-02-24T10:00:00Z',
        },
        result: {
          tool_call_id: 'tc-1',
          success: true,
          data: 'File contents here',
        },
      }),
    ];

    const workflow = makeWorkflow({ steps, status: 'completed' });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByTestId('tool-result')).toBeInTheDocument();
    expect(screen.getByTestId('result-success')).toHaveTextContent('success');
  });

  it('should render error display for failed steps', () => {
    const steps: ToolExecutionStep[] = [
      makeStep({
        step_number: 1,
        tool_call: {
          id: 'tc-1',
          tool_id: 'tool-1',
          tool_name: 'API Call',
          tool_description: '',
          parameters: {},
          status: 'failed',
          created_at: '2026-02-24T10:00:00Z',
        },
        result: {
          tool_call_id: 'tc-1',
          success: false,
          data: null,
          error: 'Connection refused',
        },
      }),
    ];

    const workflow = makeWorkflow({ steps, status: 'failed' });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByTestId('tool-error')).toBeInTheDocument();
    expect(screen.getByTestId('error-message')).toHaveTextContent('Connection refused');
    expect(screen.getByTestId('error-tool')).toHaveTextContent('API Call');
  });

  it('should invoke cancel callback when cancel is clicked', () => {
    const onCancel = vi.fn();

    const steps: ToolExecutionStep[] = [
      makeStep({
        step_number: 1,
        tool_call: {
          id: 'tc-1',
          tool_id: 'tool-1',
          tool_name: 'Long Task',
          tool_description: '',
          parameters: {},
          status: 'in_progress',
          created_at: '2026-02-24T10:00:00Z',
        },
      }),
    ];

    const workflow = makeWorkflow({ steps, status: 'in_progress' });

    render(<ToolExecutionTimeline workflow={workflow} onCancelTool={onCancel} />);

    fireEvent.click(screen.getByTestId('cancel-tc-1'));

    expect(onCancel).toHaveBeenCalledWith('tc-1');
  });

  it('should invoke retry callback on failed step retry', () => {
    const onRetry = vi.fn();

    const steps: ToolExecutionStep[] = [
      makeStep({
        step_number: 1,
        tool_call: {
          id: 'tc-1',
          tool_id: 'tool-1',
          tool_name: 'DB Query',
          tool_description: '',
          parameters: {},
          status: 'failed',
          created_at: '2026-02-24T10:00:00Z',
        },
        result: {
          tool_call_id: 'tc-1',
          success: false,
          data: null,
          error: 'Timeout',
        },
      }),
    ];

    const workflow = makeWorkflow({ steps, status: 'failed' });

    render(<ToolExecutionTimeline workflow={workflow} onRetryTool={onRetry} />);

    fireEvent.click(screen.getByTestId('retry-button'));

    expect(onRetry).toHaveBeenCalledWith('tc-1');
  });

  it('should display the goal ID when provided', () => {
    const workflow = makeWorkflow({
      goal_id: 'goal-abc-123',
      description: 'Process data',
    });

    render(<ToolExecutionTimeline workflow={workflow} />);

    expect(screen.getByText('Goal ID: goal-abc-123')).toBeInTheDocument();
  });

  it('should show metadata when not in compact mode', () => {
    const workflow = makeWorkflow({
      status: 'completed',
      started_at: '2026-02-24T10:00:00Z',
      completed_at: '2026-02-24T10:01:00Z',
      total_duration_ms: 60000,
      steps: [
        makeStep({
          step_number: 1,
          tool_call: {
            id: 'tc-1',
            tool_id: 'tool-1',
            tool_name: 'Test',
            tool_description: '',
            parameters: {},
            status: 'completed',
            created_at: '2026-02-24T10:00:00Z',
          },
        }),
      ],
    });

    render(<ToolExecutionTimeline workflow={workflow} compact={false} />);

    expect(screen.getByText('Total Steps:')).toBeInTheDocument();
  });
});
