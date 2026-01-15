import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section for error reporting */
  sectionName?: string;
  /** Custom fallback UI - if provided, replaces the default error UI */
  fallback?: ReactNode;
  /** Custom fallback render function - receives error info */
  fallbackRender?: (props: {
    error: Error;
    errorInfo: ErrorInfo | null;
    resetError: () => void;
  }) => ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show a compact error UI */
  compact?: boolean;
  /** Custom class name for the error container */
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * A reusable error boundary component for wrapping UI sections.
 * Provides user-friendly error messages and recovery options.
 *
 * Usage:
 * ```tsx
 * <SectionErrorBoundary sectionName="Chat Interface">
 *   <ChatComponent />
 * </SectionErrorBoundary>
 * ```
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, State> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log the error for debugging
    console.error(
      `[SectionErrorBoundary${this.props.sectionName ? `: ${this.props.sectionName}` : ''}] Error caught:`,
      error,
      errorInfo,
    );

    // Call the optional onError callback
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, sectionName, fallback, fallbackRender, compact, className } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Use custom fallback render function if provided
      if (fallbackRender) {
        return fallbackRender({
          error,
          errorInfo,
          resetError: this.handleReset,
        });
      }

      // Compact error UI
      if (compact) {
        return (
          <div
            className={cn(
              'flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2',
              className,
            )}
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="flex-1 text-sm text-destructive">
              {sectionName ? `${sectionName} failed to load` : 'Something went wrong'}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={this.handleReset}
              className="h-6 px-2 text-xs"
              aria-label="Retry loading this section"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Retry</span>
            </Button>
          </div>
        );
      }

      // Default error UI
      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-6',
            className,
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>

          <h3 className="mb-2 text-lg font-semibold text-foreground">
            {sectionName ? `${sectionName} Error` : 'Something went wrong'}
          </h3>

          <p className="mb-4 max-w-md text-center text-sm text-muted-foreground">
            {sectionName
              ? `The ${sectionName.toLowerCase()} encountered an unexpected error and could not be displayed.`
              : 'This section encountered an unexpected error and could not be displayed.'}
          </p>

          {import.meta.env.DEV && error && (
            <details className="mb-4 w-full max-w-md">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Error details (development only)
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded border border-border bg-muted/50 p-2 text-xs">
                {error.message}
                {errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent Stack:'}
                    {errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={this.handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default SectionErrorBoundary;
