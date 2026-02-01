/**
 * TimeoutWarningDialog Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeoutWarningDialog, type TimeoutWarningData } from '../TimeoutWarningDialog';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock toast hook
vi.mock('../../../hooks/useToast', () => ({
  toast: vi.fn(),
}));

describe('TimeoutWarningDialog', () => {
  const mockWarningData: TimeoutWarningData = {
    taskId: 'task-123',
    taskName: 'Data Analysis Task',
    remainingSeconds: 1200, // 20 minutes
    maxTimeoutMinutes: 60,
    executedSteps: 45,
    totalEstimatedSteps: 100,
    currentStep: 'Processing data chunk 5 of 10',
  };

  const defaultProps = {
    warning: mockWarningData,
    onDismiss: vi.fn(),
    isOpen: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when isOpen is true and warning is provided', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText(/time running out/i)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<TimeoutWarningDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByText(/time running out/i)).not.toBeInTheDocument();
  });

  it('does not render when warning is null', () => {
    render(<TimeoutWarningDialog {...defaultProps} warning={null} />);
    expect(screen.queryByText(/time running out/i)).not.toBeInTheDocument();
  });

  it('displays task name in the dialog', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText('Data Analysis Task')).toBeInTheDocument();
  });

  it('displays remaining time correctly', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText(/20m/)).toBeInTheDocument();
  });

  it('displays executed steps', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('displays total estimated steps', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText(/45 \/ 100/)).toBeInTheDocument();
  });

  it('displays max timeout minutes', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText(/60m max/)).toBeInTheDocument();
  });

  it('displays current step when provided', () => {
    render(<TimeoutWarningDialog {...defaultProps} />);
    expect(screen.getByText(/Processing data chunk 5 of 10/)).toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<TimeoutWarningDialog {...defaultProps} onDismiss={onDismiss} />);
    const closeButton = screen.getByLabelText('Close dialog');
    await userEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onDismiss when Continue button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<TimeoutWarningDialog {...defaultProps} onDismiss={onDismiss} />);
    const continueButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueButton);
    expect(onDismiss).toHaveBeenCalled();
  });

  describe('urgency levels', () => {
    it('shows warning level text when 5-30 minutes remaining', () => {
      render(<TimeoutWarningDialog {...defaultProps} />);
      expect(screen.getByText(/timeout approaching/i)).toBeInTheDocument();
    });

    it('shows critical level text when less than 5 minutes remaining', () => {
      const criticalWarning = {
        ...mockWarningData,
        remainingSeconds: 180, // 3 minutes
      };
      render(<TimeoutWarningDialog {...defaultProps} warning={criticalWarning} />);
      expect(screen.getByText(/time running out/i)).toBeInTheDocument();
    });

    it('shows info level text when more than 30 minutes remaining', () => {
      const infoWarning = {
        ...mockWarningData,
        remainingSeconds: 3600, // 60 minutes
      };
      render(<TimeoutWarningDialog {...defaultProps} warning={infoWarning} />);
      expect(screen.getByText(/timeout notice/i)).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('has Extend Timeout button', () => {
      render(<TimeoutWarningDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /extend timeout/i })).toBeInTheDocument();
    });

    it('has Pause button', () => {
      render(<TimeoutWarningDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    });

    it('has Abort button', () => {
      render(<TimeoutWarningDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /abort/i })).toBeInTheDocument();
    });

    it('has Continue button', () => {
      render(<TimeoutWarningDialog {...defaultProps} />);
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });
});
