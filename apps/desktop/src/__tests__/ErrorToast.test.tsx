import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorToastContainer, useErrorToast } from '../components/errors/ErrorToast';
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
      expect(container.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
    });

    it('should render toast when error is added', () => {
      const { rerender } = render(<ErrorToastContainer />);

      // Add an error
      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      rerender(<ErrorToastContainer />);

      expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('should dismiss toast when X button is clicked', () => {
      render(<ErrorToastContainer />);

      // Add an error
      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
      });

      // Click dismiss button
      const dismissButton = screen.getByLabelText('Dismiss');
      fireEvent.click(dismissButton);

      // Toast should be removed
      expect(screen.queryByText('Connection failed')).not.toBeInTheDocument();
    });

    it('should show error count when error occurs multiple times', () => {
      render(<ErrorToastContainer />);

      // Add same error multiple times
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

      expect(screen.getByText('2x')).toBeInTheDocument();
    });

    it('should show details when details section is expanded', () => {
      render(<ErrorToastContainer />);

      useErrorStore.getState().addError({
        type: 'NETWORK_ERROR',
        severity: 'error',
        message: 'Connection failed',
        details: 'Detailed error information',
      });

      // Details should be hidden initially
      expect(screen.queryByText('Detailed error information')).not.toBeVisible();

      // Click to show details
      const detailsToggle = screen.getByText('Show details');
      fireEvent.click(detailsToggle);

      // Details should now be visible
      expect(screen.getByText('Detailed error information')).toBeVisible();
    });

    it('should render different severity levels with correct styling', () => {
      const { rerender } = render(<ErrorToastContainer />);

      // Test info severity
      useErrorStore.getState().addError({
        type: 'INFO',
        severity: 'info',
        message: 'Info message',
      });
      rerender(<ErrorToastContainer />);
      expect(screen.getByText('Info message').closest('div')).toHaveClass('bg-blue-50');

      // Clear and test warning
      useErrorStore.getState().clearHistory();
      useErrorStore.getState().addError({
        type: 'WARNING',
        severity: 'warning',
        message: 'Warning message',
      });
      rerender(<ErrorToastContainer />);
      expect(screen.getByText('Warning message').closest('div')).toHaveClass('bg-yellow-50');

      // Clear and test error
      useErrorStore.getState().clearHistory();
      useErrorStore.getState().addError({
        type: 'ERROR',
        severity: 'error',
        message: 'Error message',
      });
      rerender(<ErrorToastContainer />);
      expect(screen.getByText('Error message').closest('div')).toHaveClass('bg-red-50');
    });

    it('should limit number of visible toasts', () => {
      render(<ErrorToastContainer />);

      // Add more than maxToasts (5)
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
      expect(errors[0].severity).toBe('info');
      expect(errors[0].message).toBe('Info message');
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
      expect(errors[0].severity).toBe('warning');
      expect(errors[0].type).toBe('WARNING_TYPE');
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
      expect(errors[0].severity).toBe('error');
      expect(errors[0].details).toBe('Details');
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
      expect(errors[0].severity).toBe('critical');
      expect(errors[0].stack).toBe('Stack trace');
    });
  });
});
