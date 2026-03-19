'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@shared/lib/logger';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Chat error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 mx-auto mb-6 flex items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-3">Chat Unavailable</h1>
      <p className="text-muted-foreground max-w-sm mx-auto mb-2">
        An unexpected error occurred while loading the chat. Your conversation history is safe.
      </p>

      {error.digest && (
        <p className="text-muted-foreground text-xs mb-6">Error ID: {error.digest}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-medium hover:bg-blue-700 transition-colors text-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-medium hover:bg-muted transition-colors text-foreground"
        >
          <Home className="h-4 w-4 mr-2" />
          Go Home
        </Link>
      </div>

      <div className="mt-12 pt-6 border-t border-border w-full max-w-sm">
        <p className="text-muted-foreground text-sm">
          If this problem persists,{' '}
          <Link href="/contact" className="text-blue-400 hover:text-blue-300">
            contact our support team
          </Link>
        </p>
      </div>
    </div>
  );
}
