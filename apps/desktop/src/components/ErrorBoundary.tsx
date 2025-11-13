import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, Copy, Send } from 'lucide-react';
import useErrorStore from '../stores/errorStore';
import { errorReportingService } from '../services/errorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorReported: boolean;
  copySuccess: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
      copySuccess: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Report to error store
    const errorStore = useErrorStore.getState();
    errorStore.addError({
      type: 'SYSTEM_ERROR',
      severity: 'critical',
      message: error.message,
      details: errorInfo.componentStack || undefined,
      stack: error.stack,
      context: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      },
    });

    // Report to error reporting service
    const isDevelopment = import.meta.env.DEV;
    if (!isDevelopment && errorReportingService.isEnabled()) {
      void errorReportingService.reportError({
        id: `boundary_${Date.now()}`,
        type: 'COMPONENT_ERROR',
        severity: 'critical',
        message: error.message,
        details: errorInfo.componentStack || undefined,
        stack: error.stack,
        timestamp: Date.now(),
        dismissed: false,
        count: 1,
        context: {
          componentStack: errorInfo.componentStack,
        },
      });
      this.setState({ errorReported: true });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
      copySuccess: false,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = async () => {
    if (!this.state.error) return;

    const errorDetails = {
      message: this.state.error.message,
      stack: this.state.error.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      this.setState({ copySuccess: true });
      setTimeout(() => this.setState({ copySuccess: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  handleReportError = async () => {
    if (!this.state.error) return;

    try {
      await errorReportingService.reportError({
        id: `boundary_${Date.now()}`,
        type: 'COMPONENT_ERROR',
        severity: 'critical',
        message: this.state.error.message,
        details: this.state.errorInfo?.componentStack || undefined,
        stack: this.state.error.stack,
        timestamp: Date.now(),
        dismissed: false,
        count: 1,
        context: {
          componentStack: this.state.errorInfo?.componentStack,
        },
      });
      this.setState({ errorReported: true });
    } catch (err) {
      console.error('Failed to report error:', err);
    }
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="mx-4 max-w-lg rounded-lg border border-red-200 bg-white p-8 shadow-lg dark:border-red-800 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Something went wrong
              </h1>
            </div>

            <p className="mb-4 text-gray-600 dark:text-gray-300">
              The application encountered an unexpected error. You can try reloading the page or
              resetting the view.
            </p>

            {this.state.errorReported && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Error report sent successfully. Thank you for helping us improve!
                </p>
              </div>
            )}

            {this.state.error && (
              <details className="mb-6 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
                  Error details
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="font-mono text-sm text-red-600 dark:text-red-400">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="max-h-48 overflow-auto font-mono text-xs text-gray-600 dark:text-gray-400">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
              >
                <Home className="h-4 w-4" />
                Reset View
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleCopyError}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <Copy className="h-4 w-4" />
                {this.state.copySuccess ? 'Copied!' : 'Copy Error'}
              </button>
              {!this.state.errorReported && (
                <button
                  onClick={this.handleReportError}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <Send className="h-4 w-4" />
                  Report Error
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
