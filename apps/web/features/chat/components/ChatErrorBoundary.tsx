'use client';

/**
 * ChatErrorBoundary - React error boundary for the chat message list.
 *
 * Catches uncaught rendering errors in the message list tree and displays
 * a friendly fallback UI with a "Retry" button that remounts the children.
 */

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  /** Custom fallback renderer — receives error and a reset callback */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ChatErrorBoundary] Caught rendering error:', error, info.componentStack);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      // Default fallback UI
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Failed to render messages</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              An unexpected error occurred while displaying the chat. Your messages are safe.
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-foreground/10 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/20"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
