/**
 * ErrorBoundary Component
 *
 * CHT-001 fix: Wraps child components to catch and handle React errors gracefully.
 * Prevents the entire application from crashing when an error occurs in a child component.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error for debugging (in production, this would go to error tracking)
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-neutral-950 text-white">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <h2 className="text-xl font-semibold">Something went wrong</h2>
          </div>

          <p className="text-neutral-400 text-center mb-6 max-w-md">
            An unexpected error occurred. This has been logged and we&apos;ll look into it. You can
            try again or refresh the page.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>

          {/* Show error details in development */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 w-full max-w-2xl">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400 text-sm">
                Error Details (Development Only)
              </summary>
              <pre className="mt-2 p-4 bg-neutral-900 rounded-lg text-xs text-red-400 overflow-auto max-h-64">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * ChatErrorBoundary - Specialized error boundary for the chat interface
 * Provides chat-specific error UI and recovery options
 */
export class ChatErrorBoundary extends ErrorBoundary {
  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-neutral-950 text-white">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <h2 className="text-xl font-semibold">Chat Error</h2>
          </div>

          <p className="text-neutral-400 text-center mb-6 max-w-md">
            The chat interface encountered an error. Your conversation history is safe. Click below
            to restart the chat.
          </p>

          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restart Chat
          </button>

          {/* Show error details in development */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 w-full max-w-2xl">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400 text-sm">
                Error Details (Development Only)
              </summary>
              <pre className="mt-2 p-4 bg-neutral-900 rounded-lg text-xs text-red-400 overflow-auto max-h-64">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
