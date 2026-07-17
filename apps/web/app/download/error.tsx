'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '@shared/lib/logger';

export default function DownloadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Download page error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle aria-hidden="true" className="h-10 w-10 text-destructive" />
      </div>

      <h1 className="mb-3 text-2xl font-bold">Unable to load downloads</h1>
      <p className="mx-auto mb-2 max-w-sm text-muted-foreground">
        The download page could not be loaded. Retry the page, use AGI Web, or check the CLI page.
      </p>

      {error.digest && (
        <p className="mb-6 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="agi-fl-cta agi-fl-cta--primary"
        >
          <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
          Try again
        </button>
        <Link
          href="/login?redirectTo=%2Fchat"
          className="agi-fl-cta agi-fl-cta--secondary"
        >
          Use AGI Web
        </Link>
        <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost">
          See CLI availability
        </Link>
      </div>
    </div>
  );
}
