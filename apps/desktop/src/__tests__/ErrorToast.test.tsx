import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorToastContainer, useErrorToast } from '../components/Errors/ErrorToast';
import useErrorStore from '../stores/errorStore';

describe('ErrorToast', () => {
  beforeEach(() => {
    useErrorStore.setState({
      errors: [],
      toasts: [],
    });
  });

  describe('ErrorToastContainer', () => {
    it('should render nothing when no toasts', () => {
      const { container } = render(<ErrorToastContainer />);
      expect(container.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
    });

    it('should render toast when error is added', async () => {
      render(<ErrorToastContainer />);

      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      await waitFor(() => {
        expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      });

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should dismiss toast when X button is clicked', async () => {
      render(<ErrorToastContainer />);

      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });

      const dismissButton = screen.getByLabelText('Dismiss');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Connection failed')).not.toBeInTheDocument();
      });
    });

    it('should show error count when error occurs multiple times', async () => {
      render(<ErrorToastContainer />);

      const addError = useErrorStore.getState().addError;
      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      await waitFor(() => {
        expect(screen.getByText('2x')).toBeInTheDocument();
      });
    });

    it('should show details when details section is expanded', async () => {
      render(<ErrorToastContainer />);

      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
        details: 'Detailed error information',
      });

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });

      const detailsToggle = screen.getByText('Show details');
      fireEvent.click(detailsToggle);

      expect(screen.getByText('Detailed error information')).toBeInTheDocument();
    });

    it('should render different severity levels with correct styling', () => {
      const { rerender } = render(<ErrorToastContainer />);

      useErrorStore.getState().addError({
        type: 'INFO',
        severity: 'info',
        message: 'Info message',
      });
      rerender(<ErrorToastContainer />);

      const infoAlert = screen.getByRole('alert');
      expect(infoAlert).toHaveClass('bg-blue-50');

      useErrorStore.getState().clearHistory();
      useErrorStore.getState().addError({
        type: 'WARNING',
        severity: 'warning',
        message: 'Warning message',
      });
      rerender(<ErrorToastContainer />);
      const warningAlert = screen.getByRole('alert');
      expect(warningAlert).toHaveClass('bg-yellow-50');

      useErrorStore.getState().clearHistory();
      useErrorStore.getState().addError({
        type: 'ERROR',
        severity: 'error',
        message: 'Error message',
      });
      rerender(<ErrorToastContainer />);
      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toHaveClass('bg-red-50');
    });

    it('should limit number of visible toasts', () => {
      render(<ErrorToastContainer />);

      for (let i = 0; i < 10; i++) {
        useErrorStore.getState().addError({
          type: `ERROR_${i}`,
          severity: 'error',
          message: `Error ${i}`,
        });
      }

      const toasts = useErrorStore.getState().toasts;
      expect(toasts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('useErrorToast hook', () => {
    it('should add info toast', () => {
      const TestComponent = () => {
        const { showInfo } = useErrorToast();
        return <button onClick={() => showInfo('Info message')}>Show Info</button>;
      };

      render(<TestComponent />);
      fireEvent.click(screen.getByText('Show Info'));

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('info');
      expect(errors[0]?.message).toBe('Info message');
    });

    it('should add warning toast', () => {
      const TestComponent = () => {
        const { showWarning } = useErrorToast();
        return (
          <button onClick={() => showWarning('WARNING_TYPE', 'Warning message')}>
            Show Warning
          </button>
        );
      };

      render(<TestComponent />);
      fireEvent.click(screen.getByText('Show Warning'));

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('warning');
      expect(errors[0]?.type).toBe('WARNING_TYPE');
    });

    it('should add error toast', () => {
      const TestComponent = () => {
        const { showError } = useErrorToast();
        return (
          <button onClick={() => showError('ERROR_TYPE', 'Error message', 'Details')}>
            Show Error
          </button>
        );
      };

      render(<TestComponent />);
      fireEvent.click(screen.getByText('Show Error'));

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('error');
      expect(errors[0]?.details).toBe('Details');
    });

    it('should add critical toast', () => {
      const TestComponent = () => {
        const { showCritical } = useErrorToast();
        return (
          <button
            onClick={() =>
              showCritical('CRITICAL_TYPE', 'Critical error', 'Details', 'Stack trace')
            }
          >
            Show Critical
          </button>
        );
      };

      render(<TestComponent />);
      fireEvent.click(screen.getByText('Show Critical'));

      const errors = useErrorStore.getState().errors;
      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('critical');
      expect(errors[0]?.stack).toBe('Stack trace');
    });
  });
});
