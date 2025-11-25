/**
 * ErrorBoundary Component Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import * as errorReportingService from '../../services/errorReporting';

// Mock the error store
const mockAddError = vi.fn();
vi.mock('../../stores/errorStore', () => ({
  default: {
    getState: () => ({
      addError: mockAddError,
    }),
  },
}));

// Mock the error reporting service
vi.mock('../../services/errorReporting', () => ({
  errorReportingService: {
    isEnabled: vi.fn(() => false),
    reportError: vi.fn(),
  },
}));

// Component that throws an error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock import.meta.env.DEV
    vi.stubEnv('DEV', false);
  });

  describe('Rendering', () => {
    it('should render children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>,
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should render error UI when child throws error', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText(/The application encountered an unexpected error/),
      ).toBeInTheDocument();

      consoleError.mockRestore();
    });

    it('should render custom fallback when provided', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fallback = <div>Custom error fallback</div>;

      render(
        <ErrorBoundary fallback={fallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Custom error fallback')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

      consoleError.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should call addError on error store', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(mockAddError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SYSTEM_ERROR',
          severity: 'critical',
          message: 'Test error',
        }),
      );

      consoleError.mockRestore();
    });

    it('should report error to reporting service in production', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(errorReportingService.errorReportingService.isEnabled).mockReturnValue(true);

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(errorReportingService.errorReportingService.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COMPONENT_ERROR',
          severity: 'critical',
          message: 'Test error',
        }),
      );

      consoleError.mockRestore();
    });

    it('should not report error in development mode', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.stubEnv('DEV', true);

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(errorReportingService.errorReportingService.reportError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Error UI Actions', () => {
    it('should reset error state on Reset View click', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const TestWrapper = ({ shouldError }: { shouldError: boolean }) => (
        <ErrorBoundary key={shouldError ? 'error' : 'normal'}>
          <ThrowError shouldThrow={shouldError} />
        </ErrorBoundary>
      );

      const { rerender } = render(<TestWrapper shouldError={true} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      const resetButton = screen.getByText('Reset View');
      fireEvent.click(resetButton);

      // After reset, rerender with no error - use key to force new ErrorBoundary
      rerender(<TestWrapper shouldError={false} />);

      expect(screen.getByText('No error')).toBeInTheDocument();

      consoleError.mockRestore();
    });

    it('should reload page on Reload Page click', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock window.location.reload
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const reloadButton = screen.getByText('Reload Page');
      fireEvent.click(reloadButton);

      expect(reloadMock).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should copy error details to clipboard', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock clipboard API
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const copyButton = screen.getByText('Copy Error');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });

      // Should revert back to "Copy Error" after timeout
      await waitFor(
        () => {
          expect(screen.getByText('Copy Error')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      consoleError.mockRestore();
    });

    it('should report error on Report Error click', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Ensure isEnabled returns false so the button is visible
      vi.mocked(errorReportingService.errorReportingService.isEnabled).mockReturnValue(false);
      vi.mocked(errorReportingService.errorReportingService.reportError).mockResolvedValue();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const reportButton = await screen.findByText('Report Error');
      fireEvent.click(reportButton);

      await waitFor(() => {
        expect(errorReportingService.errorReportingService.reportError).toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });
  });

  describe('Error Details Display', () => {
    it('should show error details in expandable section', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const detailsSection = screen.getByText('Error details');
      expect(detailsSection).toBeInTheDocument();

      fireEvent.click(detailsSection);

      expect(screen.getByText(/Test error/)).toBeInTheDocument();

      consoleError.mockRestore();
    });
  });

  describe('Error Reporting Status', () => {
    it('should show success message after error is reported', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(errorReportingService.errorReportingService.isEnabled).mockReturnValue(true);
      vi.mocked(errorReportingService.errorReportingService.reportError).mockResolvedValue();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Error report sent successfully/)).toBeInTheDocument();
      });

      consoleError.mockRestore();
    });

    it('should hide Report Error button after error is reported', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(errorReportingService.errorReportingService.isEnabled).mockReturnValue(true);
      vi.mocked(errorReportingService.errorReportingService.reportError).mockResolvedValue();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      await waitFor(() => {
        expect(screen.queryByText('Report Error')).not.toBeInTheDocument();
      });

      consoleError.mockRestore();
    });
  });

  describe('Clipboard Error Handling', () => {
    it('should handle clipboard write failure gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock clipboard API to fail
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard error'));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const copyButton = screen.getByText('Copy Error');
      fireEvent.click(copyButton);

      // Should not crash
      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });
  });

  describe('Multiple Errors', () => {
    it('should handle multiple errors sequentially', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First error
      const { unmount } = render(
        <ErrorBoundary key="first">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      unmount();

      // Second error with new ErrorBoundary instance
      render(
        <ErrorBoundary key="second">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(mockAddError).toHaveBeenCalledTimes(2);

      consoleError.mockRestore();
    });
  });
});
