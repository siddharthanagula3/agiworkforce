'use client';

import { useEffect } from 'react';

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
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-6 py-2 text-primary-foreground hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
