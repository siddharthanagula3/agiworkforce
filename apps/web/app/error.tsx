'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { logger } from '@shared/lib/logger';

interface ErrorInfo {
  title: string;
  message: string;
  icon: string;
  action?: { label: string; href: string };
}

function getErrorInfo(error: Error & { digest?: string }): ErrorInfo {
  const msg = error.message?.toLowerCase() ?? '';

  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many'))
    return {
      title: 'Too Many Requests',
      message: "You're sending requests too quickly. Please wait a moment and try again.",
      icon: '⏳',
    };

  if (
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('session expired') ||
    msg.includes('not authenticated')
  )
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again.',
      icon: '🔒',
      action: { label: 'Sign In', href: '/login' },
    };

  if (msg.includes('forbidden') || msg.includes('403'))
    return {
      title: 'Access Denied',
      message: "You don't have permission to access this resource.",
      icon: '🚫',
    };

  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  )
    return {
      title: 'Request Timeout',
      message: 'The request took too long. Please check your connection and try again.',
      icon: '⌛',
    };

  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound')
  )
    return {
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      icon: '📡',
    };

  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    icon: '⚠️',
  };
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error with digest for server-side correlation without exposing stack traces
    logger.error('Unhandled Next.js error boundary caught', {
      digest: error.digest,
      message: error.message,
      // Stack traces are omitted intentionally — they leak internal details in production
    });
  }, [error]);

  const errorInfo = getErrorInfo(error);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-8">
            <div className="w-24 h-24 rounded-full bg-red-500/10 mx-auto mb-6 flex items-center justify-center">
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold mb-4">{errorInfo.title}</h1>
            <p className="text-zinc-400 max-w-md mx-auto mb-2">{errorInfo.message}</p>
            {error.digest && <p className="text-zinc-600 text-sm mb-8">Error ID: {error.digest}</p>}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={reset}
              className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-8 text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
            {errorInfo.action && (
              <Link
                href={errorInfo.action.href}
                className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-700 px-8 text-sm font-medium hover:bg-zinc-600 transition-colors"
              >
                {errorInfo.action.label}
              </Link>
            )}
          </div>

          <div className="mt-16 pt-8 border-t border-zinc-800">
            <p className="text-zinc-500 text-sm">
              If this problem persists,{' '}
              <Link href="/contact" className="text-blue-400 hover:text-blue-300">
                contact our support team
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-8">
        <div className="container mx-auto px-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 font-bold">
            <Bot className="h-5 w-5 text-zinc-500" />
            <span className="text-zinc-500">AGI Workforce</span>
          </div>
          <div className="text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
