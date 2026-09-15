'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Billing]', error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <h2 className="mb-4 text-2xl font-semibold">Something went wrong</h2>
      <p className="mb-6 max-w-md text-muted-foreground">
        We encountered an error loading your billing information. Please try again or contact
        support if the issue persists.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-6 py-2 text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/chat"
          className="rounded-lg border border-border px-6 py-2 text-foreground hover:bg-muted"
        >
          Go to chat
        </Link>
        <Link
          href="/contact"
          className="px-2 py-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
