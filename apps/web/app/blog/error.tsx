'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@shared/lib/logger';

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Blog page error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 mx-auto mb-6 flex items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">Unable to Load Blog</h1>
      <p className="text-zinc-400 max-w-sm mx-auto mb-2">
        An unexpected error occurred while loading this post or page. Please try again.
      </p>

      {error.digest && <p className="text-zinc-600 text-xs mb-6">Error ID: {error.digest}</p>}

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
          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-6 text-sm font-medium hover:bg-zinc-800 transition-colors text-white"
        >
          <Home className="h-4 w-4 mr-2" />
          Go Home
        </Link>
      </div>

      <div className="mt-12 pt-6 border-t border-zinc-800 w-full max-w-sm">
        <p className="text-zinc-500 text-sm">
          If this problem persists,{' '}
          <Link href="/contact" className="text-blue-400 hover:text-blue-300">
            contact our support team
          </Link>
        </p>
      </div>
    </div>
  );
}
