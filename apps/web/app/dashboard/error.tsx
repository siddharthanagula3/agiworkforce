'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@shared/lib/logger';

function isConnectionError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed')
  );
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Dashboard error:', error);
  }, [error]);

  const connectionError = isConnectionError(error);
  const heading = connectionError ? 'Service Temporarily Unavailable' : 'Something Went Wrong';
  const description = connectionError
    ? 'We are having trouble reaching our servers. Please check your connection and try again.'
    : 'An unexpected error occurred while loading the dashboard.';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 mx-auto mb-6 flex items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">{heading}</h1>
      <p className="text-zinc-400 max-w-sm mx-auto mb-2">{description}</p>

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
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-6 text-sm font-medium hover:bg-zinc-800 transition-colors text-white"
        >
          <Home className="h-4 w-4 mr-2" />
          Back to Dashboard
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
