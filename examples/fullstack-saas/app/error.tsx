'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="hero">
      <section>
        <h1>Something broke.</h1>
        <p className="lede">
          The error was captured for triage. Retry the request or return to the dashboard.
        </p>
        <button className="button" onClick={reset} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}
