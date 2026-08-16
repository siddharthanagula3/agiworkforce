'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../cn';
import { Button } from './Button';

/**
 * Drift resolution: dev-mode detection differs by bundler — web uses
 * `process.env.NODE_ENV === 'development'` (correct for Next.js, which inlines
 * NODE_ENV at build time); desktop uses `import.meta.env.DEV` (correct for
 * Vite/Tauri). Neither is "wrong" for its own runtime, but a shared package
 * can't fork per-bundler without an abstraction, and `import.meta.env` has no
 * ambient type here (no `vite/client` types in packages/ui/ui) — it would not
 * compile standalone. Using web's `process.env.NODE_ENV` check: `@types/node`
 * is available via the workspace root, and bundlers that define
 * `process.env.NODE_ENV` (webpack, Next.js, and Vite itself via its default
 * `define` shim) all satisfy it, whereas the reverse isn't true for consumers
 * without Vite. If a future consumer's bundler doesn't inline `process.env`,
 * this should become an injected `isDev` prop/context rather than re-forking
 * per bundler.
 */
export interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallback?: ReactNode;
  fallbackRender?: (props: {
    error: Error;
    errorInfo: ErrorInfo | null;
    resetError: () => void;
  }) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  compact?: boolean;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

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

    console.error(
      `[SectionErrorBoundary${this.props.sectionName ? `: ${this.props.sectionName}` : ''}] Error caught:`,
      error,
      errorInfo,
    );

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
      if (fallback) {
        return fallback;
      }

      if (fallbackRender) {
        return fallbackRender({
          error,
          errorInfo,
          resetError: this.handleReset,
        });
      }

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

          {process.env['NODE_ENV'] === 'development' && error && (
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
