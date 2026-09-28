'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  translateUi,
} from '@agiworkforce/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void;
  compact?: boolean;
  componentName?: string;
  showReportDialog?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: null,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.setState({
      error,
      errorInfo,
      errorId,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo, errorId);
    }

    if (process.env.NODE_ENV === 'development') {
      console.error(
        `ErrorBoundary caught an error in ${this.props.componentName || 'Unknown'}:`,
        error,
        errorInfo,
      );
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.assign(new URL('/', window.location.origin));
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.props.compact) {
        return (
          <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mb-2 h-6 w-6 text-danger" />
            <p className="mb-2 text-sm text-danger">
              {this.props.componentName
                ? translateUi('errors', 'boundary.sectionFailed', '{{name}} failed to load', {
                    name: this.props.componentName,
                  })
                : translateUi('errors', 'boundary.title', 'Something went wrong')}
            </p>
            <Button
              onClick={this.handleRetry}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              {translateUi('errors', 'boundary.tryAgain', 'Try again')}
            </Button>
          </div>
        );
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-danger" />
              </div>
              <CardTitle className="text-2xl">
                {translateUi('errors', 'boundary.title', 'Something went wrong')}
              </CardTitle>
              <CardDescription>
                {translateUi(
                  'errors',
                  'boundary.message',
                  "We're sorry, but something unexpected happened.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {this.state.errorId && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm text-muted-foreground">
                    {translateUi('errors', 'boundary.errorIdLabel', 'Error ID:')}{' '}
                    <code className="font-mono">{this.state.errorId}</code>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {translateUi(
                      'errors',
                      'boundary.includeId',
                      'Please include this ID when contacting support.',
                    )}
                  </p>
                </div>
              )}

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="rounded-lg bg-destructive/10 p-4">
                  <h4 className="mb-2 font-semibold text-danger">Error Details (Development)</h4>
                  <pre className="overflow-auto text-xs text-danger">
                    {this.state.error.toString()}
                  </pre>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium">
                        Component Stack
                      </summary>
                      <pre className="mt-1 overflow-auto text-xs text-muted-foreground">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  onClick={this.handleRetry}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {translateUi('errors', 'boundary.tryAgain', 'Try again')}
                </Button>
                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {translateUi('errors', 'boundary.reload', 'Reload page')}
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="ghost"
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  {translateUi('errors', 'boundary.goHome', 'Go home')}
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                <p>
                  {translateUi('errors', 'boundary.keepsHappening', 'If this keeps happening,')}{' '}
                  <a href="/contact-sales" className="text-primary hover:underline">
                    {translateUi('errors', 'boundary.contactSupport', 'contact support')}
                  </a>
                  .
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
export { ErrorBoundary };
