'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { getFriendlyError } from '@agiworkforce/utils';
import { AgiMark } from '@agiworkforce/ui';
import { logger } from '@shared/lib/logger';

const SIGN_IN_ACTION = { label: 'Sign in', href: '/login' } as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Unhandled Next.js error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  const friendly = getFriendlyError(error);
  const signInAction = friendly.icon === 'auth' && friendly.title === 'Sign In Required';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-8">
            <div
              className="w-24 h-24 rounded-full bg-destructive/10 mx-auto mb-6 flex items-center justify-center"
              aria-hidden="true"
            >
              <AlertTriangle className="h-12 w-12 text-danger" />
            </div>
            <h1 className="text-3xl font-bold mb-4">{friendly.title}</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-2">{friendly.message}</p>
            {friendly.suggestion && (
              <p className="text-muted-foreground max-w-md mx-auto mb-2">{friendly.suggestion}</p>
            )}
            {error.digest && (
              <p className="text-muted-foreground text-sm mb-8">
                Reference for support: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={reset}
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-8 text-sm font-medium text-foreground no-underline hover:bg-muted transition-colors"
            >
              <Home className="h-4 w-4 mr-2" aria-hidden="true" />
              Go home
            </Link>
            {signInAction && (
              <Link
                href={SIGN_IN_ACTION.href}
                className="inline-flex h-12 items-center justify-center rounded-full bg-secondary px-8 text-sm font-medium text-secondary-foreground no-underline hover:bg-secondary/80 transition-colors"
              >
                {SIGN_IN_ACTION.label}
              </Link>
            )}
          </div>

          <div className="mt-16 pt-8 border-t border-border">
            <p className="text-muted-foreground text-sm">
              If this keeps happening,{' '}
              <Link href="/contact" className="text-primary hover:opacity-80">
                contact support
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-background py-8">
        <div className="container mx-auto px-4 flex flex-col items-center gap-4">
          <AgiMark size={20} mono className="text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
