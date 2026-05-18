import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('SectionErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for cleaner test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Rendering', () => {
    it('should render children when there is no error', () => {
      render(
        <SectionErrorBoundary>
          <div>Test content</div>
        </SectionErrorBoundary>,
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should render error UI when child throws error', () => {
      render(
        <SectionErrorBoundary sectionName="Test Section">
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      expect(screen.getByText('Test Section Error')).toBeInTheDocument();
      expect(
        screen.getByText(/The test section encountered an unexpected error/),
      ).toBeInTheDocument();
    });

    it('should render custom fallback when provided', () => {
      const fallback = <div>Custom error fallback</div>;

      render(
        <SectionErrorBoundary fallback={fallback}>
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      expect(screen.getByText('Custom error fallback')).toBeInTheDocument();
    });

    it('should use fallbackRender when provided', () => {
      render(
        <SectionErrorBoundary
          fallbackRender={({ error, resetError }) => (
            <div>
              <span>Error: {error.message}</span>
              <button onClick={resetError}>Reset</button>
            </div>
          )}
        >
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      expect(screen.getByText('Error: Test error')).toBeInTheDocument();
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('should render compact error UI when compact prop is true', () => {
      render(
        <SectionErrorBoundary sectionName="Chat" compact>
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      expect(screen.getByText('Chat failed to load')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should call onError callback when error is caught', () => {
      const onError = vi.fn();

      render(
        <SectionErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        }),
      );
    });

    it('should reset error state on Try Again click', () => {
      const TestWrapper = ({ shouldError }: { shouldError: boolean }) => (
        <SectionErrorBoundary key={shouldError ? 'error' : 'normal'}>
          <ThrowError shouldThrow={shouldError} />
        </SectionErrorBoundary>
      );

      const { rerender } = render(<TestWrapper shouldError={true} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      const resetButton = screen.getByText('Try Again');
      fireEvent.click(resetButton);

      rerender(<TestWrapper shouldError={false} />);

      expect(screen.getByText('No error')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <SectionErrorBoundary sectionName="Test">
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have accessible retry button', () => {
      render(
        <SectionErrorBoundary compact>
          <ThrowError shouldThrow={true} />
        </SectionErrorBoundary>,
      );

      const retryButton = screen.getByLabelText('Retry loading this section');
      expect(retryButton).toBeInTheDocument();
    });
  });
});
